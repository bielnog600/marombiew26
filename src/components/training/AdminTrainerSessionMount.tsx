import React, { useEffect, useState } from 'react';
import { useAdminTrainerSession } from '@/contexts/AdminTrainerSessionContext';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import TrainerLogSheet from './TrainerLogSheet';
import DuoTrainerLogSheet from './DuoTrainerLogSheet';
import AdminTrainerSessionBanner from './AdminTrainerSessionBanner';

const AdminTrainerSessionMount: React.FC = () => {
  const { active, isOpen, close } = useAdminTrainerSession();
  const [plan, setPlan] = useState<any | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const planId = active?.students[0]?.planId || null;

  useEffect(() => {
    if (!planId) {
      setPlan(null);
      return;
    }
    if (plan?.id === planId || loadingPlanId === planId) return;
    setLoadingPlanId(planId);
    (async () => {
      const { data } = await supabase.from('ai_plans').select('*').eq('id', planId).maybeSingle();
      setPlan(data || null);
      setLoadingPlanId(null);
    })();
  }, [planId]);

  if (!active) return null;

  return (
    <>
      <AdminTrainerSessionBanner />
      {isOpen && plan && active.mode === 'individual' && (
        <TrainerLogSheet
          open
          onOpenChange={(v) => { if (!v) close(); }}
          studentId={active.students[0].id}
          days={parseTrainingSections(plan.conteudo || '').flatMap((s) => s.days || [])}
          phase={plan.fase}
          initialDayName={active.students[0].dayName || null}
          planId={plan.id}
        />
      )}
      {isOpen && plan && active.mode === 'duo' && (
        <DuoTrainerLogSheet
          open
          onOpenChange={(v) => { if (!v) close(); }}
          studentAId={active.students[0].id}
          planA={plan}
        />
      )}
    </>
  );
};

export default AdminTrainerSessionMount;