import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InactiveStudent {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  lastActivity: string | null;
  daysInactive: number; // 999 quando nunca houve atividade
}

const daysBetween = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export const useInactiveStudents = (minDays = 3) => {
  const [students, setStudents] = useState<InactiveStudent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const allIds = (roles ?? []).map((r) => r.user_id);
      if (allIds.length === 0) { setStudents([]); return; }

      const { data: actives } = await supabase
        .from('students_profile')
        .select('user_id')
        .eq('ativo', true)
        .in('user_id', allIds);
      const ids = (actives ?? []).map((a) => a.user_id);
      if (ids.length === 0) { setStudents([]); return; }

      const [profilesRes, eventsRes, sessionsRes, trackingRes] = await Promise.all([
        supabase.from('profiles').select('user_id, nome, telefone').in('user_id', ids),
        supabase.from('student_events').select('student_id, created_at').in('student_id', ids)
          .order('created_at', { ascending: false }).limit(2000),
        supabase.from('workout_sessions').select('student_id, completed_at, started_at').in('student_id', ids)
          .order('started_at', { ascending: false }).limit(2000),
        supabase.from('daily_tracking').select('student_id, updated_at').in('student_id', ids)
          .order('updated_at', { ascending: false }).limit(2000),
      ]);

      const last = new Map<string, string>();
      const put = (id: string, iso?: string | null) => {
        if (!iso) return;
        const cur = last.get(id);
        if (!cur || new Date(iso) > new Date(cur)) last.set(id, iso);
      };
      for (const e of eventsRes.data ?? []) put(e.student_id, e.created_at);
      for (const s of sessionsRes.data ?? []) { put(s.student_id, s.completed_at); put(s.student_id, s.started_at); }
      for (const t of trackingRes.data ?? []) put(t.student_id, t.updated_at);

      const list: InactiveStudent[] = (profilesRes.data ?? []).map((p) => {
        const lastActivity = last.get(p.user_id) ?? null;
        return {
          studentId: p.user_id,
          studentName: p.nome || 'Sem nome',
          studentPhone: p.telefone ?? null,
          lastActivity,
          daysInactive: lastActivity ? daysBetween(lastActivity) : 999,
        };
      }).filter((s) => s.daysInactive > minDays);

      setStudents(list.sort((a, b) => b.daysInactive - a.daysInactive));
    } finally {
      setLoading(false);
    }
  }, [minDays]);

  useEffect(() => { load(); }, [load]);

  return { students, loading, reload: load };
};
