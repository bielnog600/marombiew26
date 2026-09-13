import { useCallback, useEffect, useState } from 'react';
import { startOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { CoachingActionType, CoachingStatus, ManualCoachingAction } from '@/lib/weeklyCoachingFocus';

export const currentWeekStart = (now: Date = new Date()) =>
  format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

/**
 * Ações manuais de coaching da semana atual (Consultoria → Para falar hoje).
 * Persistência própria: não duplica nada de exercise_set_logs.
 */
export const useWeeklyCoachingActions = () => {
  const { user } = useAuth();
  const [actions, setActions] = useState<Map<string, ManualCoachingAction[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const weekStart = currentWeekStart();

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('weekly_training_coaching_actions')
      .select('*')
      .eq('admin_id', user.id)
      .eq('week_start', weekStart);
    const map = new Map<string, ManualCoachingAction[]>();
    for (const row of (data ?? []) as ManualCoachingAction[]) {
      const list = map.get(row.student_id) ?? [];
      list.push(row);
      map.set(row.student_id, list);
    }
    setActions(map);
    setLoading(false);
  }, [user?.id, weekStart]);

  useEffect(() => { load(); }, [load]);

  const applyRow = (row: ManualCoachingAction) => {
    setActions((prev) => {
      const next = new Map(prev);
      const list = (next.get(row.student_id) ?? []).filter(
        (a) => a.exercise_name.toLowerCase() !== row.exercise_name.toLowerCase(),
      );
      list.push(row);
      next.set(row.student_id, list);
      return next;
    });
  };

  const setAction = useCallback(async (
    studentId: string,
    exerciseName: string,
    actionType: CoachingActionType,
    planId: string | null = null,
  ) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('weekly_training_coaching_actions')
      .upsert({
        admin_id: user.id,
        student_id: studentId,
        plan_id: planId,
        week_start: weekStart,
        exercise_name: exerciseName,
        action_type: actionType,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'admin_id,student_id,week_start,exercise_name' })
      .select()
      .maybeSingle();
    if (data) applyRow(data as ManualCoachingAction);
    else await load();
  }, [user?.id, weekStart, load]);

  const setStatus = useCallback(async (
    studentId: string,
    exerciseName: string,
    status: CoachingStatus,
    fallbackActionType: CoachingActionType,
    planId: string | null = null,
  ) => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('weekly_training_coaching_actions')
      .upsert({
        admin_id: user.id,
        student_id: studentId,
        plan_id: planId,
        week_start: weekStart,
        exercise_name: exerciseName,
        action_type: fallbackActionType,
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'admin_id,student_id,week_start,exercise_name' })
      .select()
      .maybeSingle();
    if (data) applyRow(data as ManualCoachingAction);
    else await load();
  }, [user?.id, weekStart, load]);

  const markManySent = useCallback(async (
    studentId: string,
    entries: { exerciseName: string; actionType: CoachingActionType }[],
    planId: string | null = null,
  ) => {
    if (!user?.id || entries.length === 0) return;
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('weekly_training_coaching_actions')
      .upsert(entries.map((e) => ({
        admin_id: user.id,
        student_id: studentId,
        plan_id: planId,
        week_start: weekStart,
        exercise_name: e.exerciseName,
        action_type: e.actionType,
        status: 'sent' as CoachingStatus,
        updated_at: now,
      })), { onConflict: 'admin_id,student_id,week_start,exercise_name' })
      .select();
    for (const row of (data ?? []) as ManualCoachingAction[]) applyRow(row);
    if (!data) await load();
  }, [user?.id, weekStart, load]);

  return { actions, loading, reload: load, setAction, setStatus, markManySent, weekStart };
};
