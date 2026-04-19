import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEventTracking } from '@/hooks/useEventTracking';

interface DailyTracking {
  id?: string;
  water_glasses: number;
  meals_completed: number[];
  workout_completed: boolean;
}

// Single source of truth for water units
export const WATER_STEP_ML = 250;
export const DEFAULT_WATER_GOAL_GLASSES = 8;
// Fórmula da avaliação física (Relatório):
// 50 ml/kg em dia sem treino; em dia de treino acrescenta 40% (média de 30–50%)
export const ML_PER_KG_REST = 50;
export const TRAINING_DAY_MULTIPLIER = 1.4;

const todayStr = () => new Date().toISOString().slice(0, 10);

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function useDailyTracking(opts?: { isTrainingDay?: boolean }) {
  const isTrainingDay = opts?.isTrainingDay ?? false;
  const { user } = useAuth();
  const { trackEvent } = useEventTracking();
  const [tracking, setTracking] = useState<DailyTracking>({
    water_glasses: 0,
    meals_completed: [],
    workout_completed: false,
  });
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('daily_tracking')
      .select('*')
      .eq('student_id', user.id)
      .eq('date', todayStr())
      .maybeSingle();

    if (data) {
      const mealsCompletedRaw = data.meals_completed;
      const mealsCompleted = Array.isArray(mealsCompletedRaw)
        ? mealsCompletedRaw.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0)
        : typeof mealsCompletedRaw === 'string'
        ? JSON.parse(mealsCompletedRaw).map((item: unknown) => Number(item)).filter((item: number) => Number.isInteger(item) && item >= 0)
        : [];

      setTracking({
        id: data.id,
        water_glasses: data.water_glasses,
        meals_completed: mealsCompleted,
        workout_completed: data.workout_completed,
      });
    }

    // Count workouts completed this week
    const { start, end } = getWeekRange();
    const { data: weekData } = await supabase
      .from('daily_tracking')
      .select('id')
      .eq('student_id', user.id)
      .eq('workout_completed', true)
      .gte('date', start)
      .lte('date', end);
    setWeeklyWorkouts(weekData?.length ?? 0);

    // Carrega peso da última avaliação para calcular meta de água
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assessment) {
      const { data: anthro } = await supabase
        .from('anthropometrics')
        .select('peso')
        .eq('assessment_id', assessment.id)
        .maybeSingle();
      if (anthro?.peso) setWeightKg(Number(anthro.peso));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Meta de água derivada: 35ml/kg sem treino, 50ml/kg em dia de treino
  const waterGoalGlasses = (() => {
    if (!weightKg) return DEFAULT_WATER_GOAL_GLASSES;
    const baseMl = weightKg * ML_PER_KG_REST;
    const totalMl = isTrainingDay ? baseMl * TRAINING_DAY_MULTIPLIER : baseMl;
    const glasses = Math.round(totalMl / WATER_STEP_ML);
    return Math.max(glasses, 6);
  })();

  const upsert = useCallback(async (updates: Partial<DailyTracking>) => {
    if (!user) return;
    const next = { ...tracking, ...updates };
    setTracking(next);

    const row = {
      student_id: user.id,
      date: todayStr(),
      water_glasses: next.water_glasses,
      meals_completed: next.meals_completed,
      workout_completed: next.workout_completed,
    };

    await supabase.from('daily_tracking').upsert(row, { onConflict: 'student_id,date' });
  }, [user, tracking]);

  const addWater = useCallback(() => {
    const next = Math.min(tracking.water_glasses + 1, 20);
    upsert({ water_glasses: next });
    trackEvent('water_logged', { glasses: next });
    if (next >= waterGoalGlasses && tracking.water_glasses < waterGoalGlasses) {
      trackEvent('water_goal_hit', { glasses: next, goal: waterGoalGlasses });
    }
  }, [upsert, tracking.water_glasses, trackEvent, waterGoalGlasses]);

  const removeWater = useCallback(() => {
    upsert({ water_glasses: Math.max(tracking.water_glasses - 1, 0) });
  }, [upsert, tracking.water_glasses]);

  const toggleMeal = useCallback((mealIndex: number) => {
    const current = tracking.meals_completed;
    const isAdding = !current.includes(mealIndex);
    const next = isAdding
      ? [...current, mealIndex]
      : current.filter(i => i !== mealIndex);
    upsert({ meals_completed: next });
    if (isAdding) trackEvent('meal_logged', { meal_index: mealIndex });
  }, [upsert, tracking.meals_completed, trackEvent]);

  const completeWorkout = useCallback(() => {
    upsert({ workout_completed: true });
  }, [upsert]);

  return {
    tracking,
    loading,
    weeklyWorkouts,
    waterGoalGlasses,
    waterCurrentMl: tracking.water_glasses * WATER_STEP_ML,
    waterTargetMl: waterGoalGlasses * WATER_STEP_ML,
    waterStepMl: WATER_STEP_ML,
    addWater,
    removeWater,
    toggleMeal,
    completeWorkout,
  };
}
