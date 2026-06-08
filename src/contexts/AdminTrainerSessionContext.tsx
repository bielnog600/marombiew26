import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import {
  linkOrCreateAgendaEventForSession,
  completeAgendaEventForSession,
} from '@/lib/agendaAutoLink';

export type AdminSessionMode = 'individual' | 'duo';

export interface AdminSessionStudent {
  id: string;
  nome: string;
  planId?: string | null;
  dayName?: string | null;
  phase?: string | null;
}

export interface AdminActiveSession {
  id: string;
  mode: AdminSessionMode;
  startedAtReal: string;
  students: AdminSessionStudent[];
  calendarEventIds: Record<string, string>;
  sessionState: any;
}

interface Ctx {
  active: AdminActiveSession | null;
  isOpen: boolean;
  loading: boolean;
  start: (params: { mode: AdminSessionMode; students: AdminSessionStudent[] }) => Promise<AdminActiveSession>;
  open: () => void;
  close: () => void;
  finish: (totalsByStudent: Record<string, { exercisesCompleted: number; totalExercises: number }>) => Promise<void>;
  cancel: () => Promise<void>;
  patchState: (updater: (prev: any) => any) => void;
  refresh: () => Promise<void>;
}

const AdminTrainerSessionContext = createContext<Ctx | null>(null);

export const useAdminTrainerSession = () => {
  const v = useContext(AdminTrainerSessionContext);
  if (!v) throw new Error('AdminTrainerSessionProvider missing');
  return v;
};

export const AdminTrainerSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role } = useAuth();
  const [active, setActive] = useState<AdminActiveSession | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const activeIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const pendingState = useRef<any>(null);

  const flushNow = useCallback(async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const id = activeIdRef.current;
    const payload = pendingState.current;
    if (!id || payload == null) return;
    pendingState.current = null;
    try {
      await supabase.from('workout_sessions').update({ session_state: payload }).eq('id', id);
    } catch (e) {
      console.error('flush session_state failed', e);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user || role !== 'admin') {
      setActive(null);
      activeIdRef.current = null;
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('workout_sessions')
      .select(
        'id, student_id, paired_student_id, started_at_real, started_at, session_mode, session_state, calendar_event_id, status, source',
      )
      .eq('status', 'in_progress')
      .eq('source', 'admin')
      .order('started_at_real', { ascending: false })
      .limit(30);

    const row = (data || []).find((r: any) => r.session_state?.meta?.admin_id === user.id);
    if (row) {
      const meta = row.session_state?.meta || {};
      const students: AdminSessionStudent[] = meta.students || [];
      const calendarEventIds: Record<string, string> = { ...(meta.calendar_event_ids || {}) };
      if (row.calendar_event_id && students[0] && !calendarEventIds[students[0].id]) {
        calendarEventIds[students[0].id] = row.calendar_event_id;
      }
      const a: AdminActiveSession = {
        id: row.id,
        mode: row.session_mode === 'duo' ? 'duo' : 'individual',
        startedAtReal: row.started_at_real || row.started_at,
        students,
        calendarEventIds,
        sessionState: row.session_state || {},
      };
      activeIdRef.current = a.id;
      setActive(a);
    } else {
      activeIdRef.current = null;
      setActive(null);
    }
    setLoading(false);
  }, [user, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start: Ctx['start'] = useCallback(
    async ({ mode, students }) => {
      if (!user) throw new Error('Sem usuário');
      if (students.length === 0) throw new Error('Nenhum aluno');
      const startedAt = new Date();
      const calendarEventIds: Record<string, string> = {};
      for (const s of students) {
        try {
          const { calendarEventId } = await linkOrCreateAgendaEventForSession({
            studentId: s.id,
            adminId: user.id,
            startedAtReal: startedAt,
            dayName: s.dayName || null,
            phase: s.phase || null,
          });
          calendarEventIds[s.id] = calendarEventId;
        } catch (e) {
          console.error('agenda link failed', e);
        }
      }
      const first = students[0];
      const second = students[1];
      const meta = {
        admin_id: user.id,
        mode,
        students: students.map((s) => ({
          id: s.id,
          nome: s.nome,
          planId: s.planId ?? null,
          dayName: s.dayName ?? null,
          phase: s.phase ?? null,
        })),
        calendar_event_ids: calendarEventIds,
      };
      const session_state = { meta, form: {} };
      const insertPayload: any = {
        student_id: first.id,
        day_name: first.dayName || null,
        phase: first.phase || null,
        started_at: startedAt.toISOString(),
        started_at_real: startedAt.toISOString(),
        completed_at: startedAt.toISOString(),
        calendar_event_id: calendarEventIds[first.id] || null,
        status: 'in_progress',
        source: 'admin',
        executed_by: 'coach',
        session_mode: mode,
        paired_student_id: second?.id || null,
        session_state,
        total_exercises: 0,
        exercises_completed: 0,
        duration_minutes: 0,
      };
      const { data, error } = await supabase
        .from('workout_sessions')
        .insert(insertPayload)
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Falha ao iniciar sessão');
      const a: AdminActiveSession = {
        id: data.id,
        mode,
        startedAtReal: startedAt.toISOString(),
        students,
        calendarEventIds,
        sessionState: session_state,
      };
      activeIdRef.current = a.id;
      setActive(a);
      setIsOpen(true);
      return a;
    },
    [user],
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const patchState: Ctx['patchState'] = useCallback(
    (updater) => {
      setActive((prev) => {
        if (!prev) return prev;
        const currentForm = prev.sessionState?.form ?? {};
        const nextForm = updater(currentForm);
        const nextState = { ...prev.sessionState, form: nextForm };
        pendingState.current = nextState;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          flushNow();
        }, 1500);
        return { ...prev, sessionState: nextState };
      });
    },
    [flushNow],
  );

  const finish: Ctx['finish'] = useCallback(
    async (totalsByStudent) => {
      if (!active || !user) return;
      await flushNow();
      const completedAt = new Date();
      const startedAt = new Date(active.startedAtReal);
      const durationMinutes = Math.max(1, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000));
      const first = active.students[0];
      const firstTotals = totalsByStudent[first.id] || { exercisesCompleted: 0, totalExercises: 0 };
      await supabase
        .from('workout_sessions')
        .update({
          status: 'completed',
          completed_at: completedAt.toISOString(),
          completed_at_real: completedAt.toISOString(),
          duration_minutes: durationMinutes,
          exercises_completed: firstTotals.exercisesCompleted,
          total_exercises: firstTotals.totalExercises,
        })
        .eq('id', active.id);

      if (active.mode === 'duo' && active.students[1]) {
        const second = active.students[1];
        const t = totalsByStudent[second.id] || { exercisesCompleted: 0, totalExercises: 0 };
        await supabase.from('workout_sessions').insert({
          student_id: second.id,
          day_name: second.dayName || null,
          phase: second.phase || null,
          started_at: active.startedAtReal,
          started_at_real: active.startedAtReal,
          completed_at: completedAt.toISOString(),
          completed_at_real: completedAt.toISOString(),
          calendar_event_id: active.calendarEventIds[second.id] || null,
          duration_minutes: durationMinutes,
          exercises_completed: t.exercisesCompleted,
          total_exercises: t.totalExercises,
          status: 'completed',
          source: 'admin',
          executed_by: 'coach',
          session_mode: 'duo',
          paired_student_id: first.id,
        } as any);
      }

      for (const s of active.students) {
        const evId = active.calendarEventIds[s.id];
        if (evId) {
          try {
            await completeAgendaEventForSession({
              calendarEventId: evId,
              studentId: s.id,
              adminId: user.id,
              startedAtReal: startedAt,
              completedAtReal: completedAt,
            });
          } catch (e) {
            console.error('agenda complete failed', e);
          }
        }
      }

      activeIdRef.current = null;
      setActive(null);
      setIsOpen(false);
      toast.success('Treino finalizado!');
    },
    [active, user, flushNow],
  );

  const cancel: Ctx['cancel'] = useCallback(async () => {
    if (!active) return;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingState.current = null;
    await supabase.from('workout_sessions').update({ status: 'abandoned' }).eq('id', active.id);
    activeIdRef.current = null;
    setActive(null);
    setIsOpen(false);
    toast.success('Sessão cancelada.');
  }, [active]);

  return (
    <AdminTrainerSessionContext.Provider
      value={{ active, isOpen, loading, start, open, close, finish, cancel, patchState, refresh }}
    >
      {children}
    </AdminTrainerSessionContext.Provider>
  );
};