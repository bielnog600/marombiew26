import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEventTracking } from '@/hooks/useEventTracking';
import { writeWithFallback } from '@/lib/offlineQueue';
import { fetchWithCache, setCache } from '@/lib/offlineCache';
import { toast } from '@/hooks/use-toast';
import { localDateKey, getWeekRange, emptyDailyTracking, normalizeDailyTracking, canRegisterTrackingDate, type DailyTracking } from '@/lib/localTrackingWeek';

// Single source of truth for water units
export const WATER_STEP_ML = 250;
export const DEFAULT_WATER_GOAL_GLASSES = 8;
// Fórmula da avaliação física (Relatório):
// 50 ml/kg em dia sem treino; em dia de treino acrescenta 40% (média de 30–50%)
export const ML_PER_KG_REST = 50;
export const TRAINING_DAY_MULTIPLIER = 1.4;

export function useDailyTracking(opts?: { isTrainingDay?: boolean; date?: string }) {
  const isTrainingDay = opts?.isTrainingDay ?? false;
  const { user } = useAuth();
  const { trackEvent } = useEventTracking();
  const [today, setToday] = useState(localDateKey);
  useEffect(() => {
    const refresh = () => setToday(localDateKey());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const week = getWeekRange(new Date(`${today}T12:00:00`));
  const selectedDate = opts?.date ?? today;
  const [weeklyTracking, setWeeklyTracking] = useState<Record<string, DailyTracking>>({});
  const weekRef = useRef(weeklyTracking);
  const [loadedKey, setLoadedKey] = useState('');
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const cacheKey = user ? `tracking-week:${user.id}:${week.start}` : '';
  const loading = Boolean(user && loadedKey !== cacheKey);
  const visibleWeek = loadedKey === cacheKey ? weeklyTracking : {};
  const tracking = visibleWeek[selectedDate] ?? emptyDailyTracking();
  const weeklyWorkouts = Object.values(visibleWeek).filter(row => row.workout_completed).length;
  const extraKey = user ? `water-extra-${user.id}-${selectedDate}` : '';
  let extraMl = 0;
  try {
    extraMl = tracking.water_ml != null
      ? Math.max(0, tracking.water_ml - tracking.water_glasses * WATER_STEP_ML)
      : Math.max(0, Math.min(WATER_STEP_ML - 1, Number(localStorage.getItem(extraKey)) || 0));
  } catch { /* ignore */ }
  const persistExtra = useCallback((ml: number) => {
    try { if (extraKey) localStorage.setItem(extraKey, String(ml)); } catch { /* ignore */ }
  }, [extraKey]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [weekResult, weightResult] = await Promise.all([
          fetchWithCache(cacheKey, async () => {
            const { data, error } = await supabase.from('daily_tracking')
              .select('id,date,water_glasses,water_ml,meals_completed,workout_completed')
              .eq('student_id', user.id).gte('date', week.start).lte('date', week.end);
            if (error) throw error;
            return data ?? [];
          }),
          fetchWithCache(`weight:${user.id}`, async () => {
            const { data: assessment } = await supabase.from('assessments').select('id').eq('student_id', user.id)
              .order('created_at', { ascending: false }).limit(1).maybeSingle();
            if (!assessment) return null;
            const { data: anthro } = await supabase.from('anthropometrics').select('peso').eq('assessment_id', assessment.id).maybeSingle();
            return anthro?.peso ? Number(anthro.peso) : null;
          }),
        ]);
        if (cancelled) return;
        const next: Record<string, DailyTracking> = {};
        for (const row of weekResult.data ?? []) next[row.date] = normalizeDailyTracking(row);
        weekRef.current = next;
        setWeeklyTracking(next);
        setWeightKg(weightResult.data ?? null);
      } catch (error) {
        console.error('Error loading daily tracking:', error);
      } finally {
        if (!cancelled) setLoadedKey(cacheKey);
      }
    })();
    return () => { cancelled = true; };
  }, [user, cacheKey, week.start, week.end]);

  const ensureCanRegister = useCallback(() => {
    if (canRegisterTrackingDate(selectedDate)) return true;
    toast({ title: selectedDate > localDateKey() ? 'Esse dia ainda não chegou' : 'Selecione um dia da semana atual' });
    return false;
  }, [selectedDate]);

  // Meta de água derivada: 35ml/kg sem treino, 50ml/kg em dia de treino
  const waterGoalGlasses = (() => {
    if (!weightKg) return DEFAULT_WATER_GOAL_GLASSES;
    const baseMl = weightKg * ML_PER_KG_REST;
    const totalMl = isTrainingDay ? baseMl * TRAINING_DAY_MULTIPLIER : baseMl;
    const glasses = Math.round(totalMl / WATER_STEP_ML);
    return Math.max(glasses, 6);
  })();

  const upsert = useCallback(async (updates: Partial<DailyTracking>) => {
    if (!user || loading || !ensureCanRegister()) return;
    const next = { ...(weekRef.current[selectedDate] ?? emptyDailyTracking()), ...updates };
    const nextWeek = { ...weekRef.current, [selectedDate]: next };
    weekRef.current = nextWeek;
    setWeeklyTracking(nextWeek);
    const row = {
      student_id: user.id,
      date: selectedDate,
      water_glasses: next.water_glasses,
      ...(next.water_ml != null ? { water_ml: next.water_ml } : {}),
      meals_completed: next.meals_completed,
      workout_completed: next.workout_completed,
    };
    // Optimistic writes also refresh the weekly offline snapshot, without deleting history.
    void setCache(cacheKey, Object.entries(nextWeek).map(([date, entry]) => ({ ...entry, date })));
    void setCache(`tracking:${user.id}:${selectedDate}`, { ...next, date: selectedDate });
    await writeWithFallback({ table: 'daily_tracking', op: 'upsert', payload: row, onConflict: 'student_id,date' });
  }, [user, selectedDate, cacheKey, loading, ensureCanRegister]);

  const addWater = useCallback(() => {
    if (loading || !ensureCanRegister()) return;
    const next = Math.min(tracking.water_glasses + 1, 20);
    upsert({ water_glasses: next, water_ml: next * WATER_STEP_ML + extraMl });
    trackEvent('water_logged', { glasses: next });
    if (next >= waterGoalGlasses && tracking.water_glasses < waterGoalGlasses) {
      trackEvent('water_goal_hit', { glasses: next, goal: waterGoalGlasses });
    }
  }, [loading, ensureCanRegister, upsert, tracking.water_glasses, extraMl, trackEvent, waterGoalGlasses]);

  const removeWater = useCallback(() => {
    if (loading || !ensureCanRegister()) return;
    const next = Math.max(tracking.water_glasses - 1, 0);
    upsert({ water_glasses: next, water_ml: next * WATER_STEP_ML + extraMl });
  }, [loading, ensureCanRegister, upsert, tracking.water_glasses, extraMl]);

  /** Adiciona (ou remove, com valor negativo) uma quantidade livre de água em ml. */
  const addWaterMl = useCallback((ml: number) => {
    if (loading || !ensureCanRegister()) return;
    const totalMl = Math.max(0, Math.round((tracking.water_ml ?? tracking.water_glasses * WATER_STEP_ML + extraMl) + ml));
    const glasses = Math.min(Math.floor(totalMl / WATER_STEP_ML), 40);
    const rest = totalMl - glasses * WATER_STEP_ML;
    persistExtra(rest);
    upsert({ water_glasses: glasses, water_ml: totalMl });
    if (glasses !== tracking.water_glasses) {
      if (ml > 0) {
        trackEvent('water_logged', { glasses });
        if (glasses >= waterGoalGlasses && tracking.water_glasses < waterGoalGlasses) {
          trackEvent('water_goal_hit', { glasses, goal: waterGoalGlasses });
        }
      }
    }
  }, [loading, ensureCanRegister, tracking.water_glasses, tracking.water_ml, extraMl, persistExtra, upsert, trackEvent, waterGoalGlasses]);

  const toggleMeal = useCallback((mealIndex: number) => {
    if (loading || !ensureCanRegister()) return;
    const current = tracking.meals_completed;
    const isAdding = !current.includes(mealIndex);
    const next = isAdding
      ? [...current, mealIndex]
      : current.filter(i => i !== mealIndex);
    upsert({ meals_completed: next });
    if (isAdding) trackEvent('meal_logged', { meal_index: mealIndex });
  }, [loading, ensureCanRegister, upsert, tracking.meals_completed, trackEvent]);

  const completeWorkout = useCallback(() => {
    if (loading || !ensureCanRegister()) return;
    upsert({ workout_completed: true });
  }, [loading, ensureCanRegister, upsert]);

  return {
    tracking,
    weeklyTracking: visibleWeek,
    weekDates: week.dates,
    today,
    selectedDate,
    ensureCanRegister,
    loading,
    weeklyWorkouts,
    waterGoalGlasses,
    waterCurrentMl: tracking.water_ml ?? tracking.water_glasses * WATER_STEP_ML + extraMl,
    waterTargetMl: waterGoalGlasses * WATER_STEP_ML,
    waterStepMl: WATER_STEP_ML,
    addWater,
    addWaterMl,
    removeWater,
    toggleMeal,
    completeWorkout,
  };
}
