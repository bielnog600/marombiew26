import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { gridSizeForGoal, type GoalDraft, type SavingsDeposit, type SavingsGoal } from '@/lib/savingsGoal';

/** Metas de depósitos do admin + depósitos de todas elas (só o dono, via RLS). */
export function useSavingsGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [deposits, setDeposits] = useState<SavingsDeposit[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) return;
    const { data: g, error } = await supabase
      .from('savings_goals')
      .select('id, nome, meta_valor, inicio, fim, max_valor')
      .eq('owner_id', user.id)
      .order('inicio', { ascending: true });
    if (error) { setLoading(false); throw error; }
    const list = (g ?? []).map(r => ({ ...r, meta_valor: Number(r.meta_valor) })) as SavingsGoal[];
    let deps: SavingsDeposit[] = [];
    if (list.length) {
      const { data: d, error: e2 } = await supabase
        .from('savings_deposits')
        .select('id, goal_id, valor, depositado_em, created_at')
        .in('goal_id', list.map(x => x.id));
      if (e2) { setLoading(false); throw e2; }
      deps = (d ?? []) as SavingsDeposit[];
    }
    setGoals(list);
    setDeposits(deps);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch().catch(() => setLoading(false)); }, [refetch]);

  const saveGoal = useCallback(async (draft: GoalDraft, id?: string): Promise<SavingsGoal> => {
    if (!user) throw new Error('Sessão expirada');
    const row = {
      nome: draft.nome.trim(),
      meta_valor: draft.meta_valor,
      inicio: draft.inicio,
      fim: draft.fim,
      max_valor: gridSizeForGoal(draft.meta_valor),
    };
    const q = id
      ? supabase.from('savings_goals').update(row).eq('id', id)
      : supabase.from('savings_goals').insert({ ...row, owner_id: user.id });
    const { data, error } = await q.select('id, nome, meta_valor, inicio, fim, max_valor').single();
    if (error) throw error;
    const saved = { ...data, meta_valor: Number(data.meta_valor) } as SavingsGoal;
    setGoals(prev => (id ? prev.map(g => (g.id === id ? saved : g)) : [...prev, saved]));
    return saved;
  }, [user]);

  const addDeposit = useCallback(async (goalId: string, valor: number, day: string) => {
    const tempId = `tmp-${goalId}-${valor}`;
    setDeposits(prev => [...prev, { id: tempId, goal_id: goalId, valor, depositado_em: day, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase
      .from('savings_deposits')
      .upsert({ goal_id: goalId, valor, depositado_em: day }, { onConflict: 'goal_id,valor' })
      .select('id, goal_id, valor, depositado_em, created_at')
      .single();
    if (error) {
      setDeposits(prev => prev.filter(d => d.id !== tempId));
      throw error;
    }
    setDeposits(prev => [...prev.filter(d => d.id !== tempId && !(d.goal_id === goalId && d.valor === valor)), data as SavingsDeposit]);
  }, []);

  const changeDepositDate = useCallback(async (dep: SavingsDeposit, day: string) => {
    setDeposits(prev => prev.map(d => (d.id === dep.id ? { ...d, depositado_em: day } : d)));
    const { error } = await supabase.from('savings_deposits').update({ depositado_em: day }).eq('id', dep.id);
    if (error) {
      setDeposits(prev => prev.map(d => (d.id === dep.id ? dep : d)));
      throw error;
    }
  }, []);

  const removeDeposit = useCallback(async (dep: SavingsDeposit) => {
    setDeposits(prev => prev.filter(d => d.id !== dep.id));
    const { error } = await supabase.from('savings_deposits').delete().eq('id', dep.id);
    if (error) {
      setDeposits(prev => [...prev, dep]);
      throw error;
    }
  }, []);

  return { goals, deposits, loading, refetch, saveGoal, addDeposit, changeDepositDate, removeDeposit };
}

export type SavingsGoalsApi = ReturnType<typeof useSavingsGoals>;
