import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface BehavioralAlert {
  id: string;
  student_id: string;
  alert_key: string;
  category: string;
  priority: 'alta' | 'media' | 'baixa';
  title: string;
  description: string | null;
  status: 'pendente' | 'lido' | 'resolvido';
  created_at: string;
  updated_at: string;
  studentName?: string;
}

export const useBehavioralAlerts = () => {
  const [alerts, setAlerts] = useState<BehavioralAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('behavioral_alerts')
      .select('*')
      .neq('status', 'resolvido')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('load behavioral alerts error', error);
      setLoading(false);
      return;
    }

    const studentIds = [...new Set((data ?? []).map((a) => a.student_id))];
    let nameMap: Record<string, string> = {};
    let activeSet = new Set<string>();
    if (studentIds.length > 0) {
      const [{ data: profiles }, { data: activeProfiles }] = await Promise.all([
        supabase.from('profiles').select('user_id, nome').in('user_id', studentIds),
        supabase.from('students_profile').select('user_id').eq('ativo', true).in('user_id', studentIds),
      ]);
      nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.nome]));
      activeSet = new Set((activeProfiles ?? []).map((p) => p.user_id));
    }

    setAlerts(
      (data ?? [])
        .filter((a: any) => activeSet.has(a.student_id))
        .map((a: any) => ({
          ...a,
          studentName: nameMap[a.student_id] || 'Aluno',
        }))
    );
    setLoading(false);
  }, []);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      await supabase.functions.invoke('behavioral-alerts-generator');
      await load();
    } finally {
      setGenerating(false);
    }
  }, [load]);

  const updateStatus = useCallback(
    async (id: string, status: BehavioralAlert['status']) => {
      const updates: any = { status };
      if (status === 'resolvido') updates.resolved_at = new Date().toISOString();
      await supabase.from('behavioral_alerts').update(updates).eq('id', id);
      setAlerts((prev) =>
        status === 'resolvido' ? prev.filter((a) => a.id !== id) : prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return { alerts, loading, generating, generate, updateStatus, reload: load };
};
