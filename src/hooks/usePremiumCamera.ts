import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Lê students_profile.premium_camera do aluno logado; qualquer falha = sem acesso. */
export function usePremiumCamera(userId: string | null | undefined): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!userId) { setEnabled(false); return; }
    let cancelled = false;
    supabase
      .from('students_profile')
      .select('premium_camera')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled) setEnabled(!error && data?.premium_camera === true);
      }, () => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, [userId]);
  return enabled;
}
