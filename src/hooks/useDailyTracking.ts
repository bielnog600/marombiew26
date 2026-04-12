import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface DailyTracking {
  id?: string;
  water_glasses: number;
  meals_completed: number[];
  workout_completed: boolean;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export function useDailyTracking() {
  const { user } = useAuth();
  const [tracking, setTracking] = useState<DailyTracking>({
    water_glasses: 0,
    meals_completed: [],
    workout_completed: false,
  });
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
      setTracking({
        id: data.id,
        water_glasses: data.water_glasses,
        meals_completed: (data.meals_completed as number[]) || [],
        workout_completed: data.workout_completed,
      });
    }
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
      meals_completed: JSON.stringify(next.meals_completed),
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
    addWater,
    removeWater,
    toggleMeal,
    completeWorkout,
  };
}
