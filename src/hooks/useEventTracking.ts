import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type StudentEventType =
  | 'app_opened'
  | 'workout_started'
  | 'workout_completed'
  | 'workout_abandoned'
  | 'workout_load_logged'
  | 'meal_logged'
  | 'water_logged'
  | 'water_goal_hit';

const todayKey = () => new Date().toISOString().slice(0, 10);

export const useEventTracking = () => {
  const { user, role } = useAuth();

  const trackEvent = useCallback(
    async (eventType: StudentEventType, metadata: Record<string, any> = {}) => {
      if (!user || role !== 'aluno') return;

      // Idempotência diária para app_opened
      if (eventType === 'app_opened') {
        const storageKey = `app_opened_${user.id}_${todayKey()}`;
        if (localStorage.getItem(storageKey)) return;
        localStorage.setItem(storageKey, '1');
      }

      try {
        await supabase.from('student_events').insert({
          student_id: user.id,
          event_type: eventType,
          metadata,
        });
      } catch (err) {
        // Silencioso — tracking não deve quebrar o fluxo
        console.warn('trackEvent failed:', err);
      }
    },
    [user, role]
  );

  return { trackEvent };
};
