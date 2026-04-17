import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DailyTracking {
  id?: string;
  water_glasses: number;
  meals_completed: number[];
  workout_completed: boolean;
}

// Single source of truth for water units
export const WATER_STEP_ML = 250;
export const DEFAULT_WATER_GOAL_GLASSES = 8;

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

export function useDailyTracking() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState<DailyTracking>({
    water_glasses: 0,
    meals_completed: [],
    workout_completed: false,
  });
  const [weeklyWorkouts, setWeeklyWorkouts] = useState(0);
  const [waterGoalGlasses, setWaterGoalGlasses] = useState(DEFAULT_WATER_GOAL_GLASSES);
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

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

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
    upsert({ water_glasses: Math.min(tracking.water_glasses + 1, 20) });
  }, [upsert, tracking.water_glasses]);

  const removeWater = useCallback(() => {
    upsert({ water_glasses: Math.max(tracking.water_glasses - 1, 0) });
  }, [upsert, tracking.water_glasses]);

  const toggleMeal = useCallback((mealIndex: number) => {
    const current = tracking.meals_completed;
    const next = current.includes(mealIndex)
      ? current.filter(i => i !== mealIndex)
      : [...current, mealIndex];
    upsert({ meals_completed: next });
  }, [upsert, tracking.meals_completed]);

  const completeWorkout = useCallback(() => {
    upsert({ workout_completed: true });
  }, [upsert]);

  return {
    tracking,
    loading,
    weeklyWorkouts,
    addWater,
    removeWater,
    toggleMeal,
    completeWorkout,
  };
}
