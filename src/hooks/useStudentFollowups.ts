import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type FollowupStatus = 'pendente' | 'falado_hoje' | 'em_espera' | 'resolvido';

export interface StudentFollowup {
  id: string;
  student_id: string;
  status: FollowupStatus;
  last_contacted_at: string | null;
  snoozed_until: string | null;
  note: string | null;
  updated_at: string;
}

export type SnoozeOption = 'amanha' | '3d' | '7d' | 'proxima_semana' | 'none';

const snoozeToDate = (opt: SnoozeOption): string | null => {
  const d = new Date();
  switch (opt) {
    case 'amanha': d.setDate(d.getDate() + 1); break;
    case '3d': d.setDate(d.getDate() + 3); break;
    case '7d': d.setDate(d.getDate() + 7); break;
    case 'proxima_semana': {
      const day = d.getDay();
      const diff = (8 - day) % 7 || 7;
      d.setDate(d.getDate() + diff);
      break;
    }
    case 'none': return null;
  }
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
};

export const useStudentFollowups = () => {
  const { user } = useAuth();
  const [followups, setFollowups] = useState<Map<string, StudentFollowup>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setFollowups(new Map()); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('student_followups')
      .select('*')
      .eq('admin_id', user.id);
    const m = new Map<string, StudentFollowup>();
    for (const r of data ?? []) m.set(r.student_id, r as StudentFollowup);
    setFollowups(m);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const markAsDone = useCallback(async (studentId: string, snooze: SnoozeOption) => {
    if (!user?.id) return;
    const snoozedUntil = snoozeToDate(snooze);
    const payload = {
      student_id: studentId,
      admin_id: user.id,
      status: (snooze === 'none' ? 'falado_hoje' : 'em_espera') as FollowupStatus,
      last_contacted_at: new Date().toISOString(),
      snoozed_until: snoozedUntil,
    };
    const { data, error } = await supabase
      .from('student_followups')
      .upsert(payload, { onConflict: 'student_id,admin_id' })
      .select()
      .single();
    if (!error && data) {
      setFollowups((prev) => {
        const n = new Map(prev);
        n.set(studentId, data as StudentFollowup);
        return n;
      });
    }
    return { data, error };
  }, [user?.id]);

  const reopen = useCallback(async (studentId: string) => {
    if (!user?.id) return;
    const payload = {
      student_id: studentId,
      admin_id: user.id,
      status: 'pendente' as FollowupStatus,
      snoozed_until: null,
    };
    const { data } = await supabase
      .from('student_followups')
      .upsert(payload, { onConflict: 'student_id,admin_id' })
      .select()
      .single();
    if (data) {
      setFollowups((prev) => {
        const n = new Map(prev);
        n.set(studentId, data as StudentFollowup);
        return n;
      });
    }
  }, [user?.id]);

  return { followups, loading, reload: load, markAsDone, reopen };
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export type FollowupBucket = 'hoje' | 'falados' | 'espera';

export const bucketFor = (f: StudentFollowup | undefined): FollowupBucket => {
  if (!f) return 'hoje';
  const now = new Date();
  if (f.snoozed_until && new Date(f.snoozed_until) > now) return 'espera';
  if (f.last_contacted_at && isSameDay(new Date(f.last_contacted_at), now)) return 'falados';
  return 'hoje';
};
