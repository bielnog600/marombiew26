import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { canWeighMeals } from '@/lib/mealWeigh';

/** Lê students_profile.premium_scale do aluno logado; qualquer falha = sem acesso. */
export function usePremiumScale(userId: string | null | undefined): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!userId) { setEnabled(false); return; }
    let cancelled = false;
    try {
      supabase
        .from('students_profile')
        .select('premium_scale')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!cancelled) setEnabled(!error && canWeighMeals(data as { premium_scale?: boolean } | null));
        }, () => { if (!cancelled) setEnabled(false); });
    } catch {
      setEnabled(false);
    }
    return () => { cancelled = true; };
  }, [userId]);
  return enabled;
}
