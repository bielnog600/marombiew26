import React, { useEffect, useState } from 'react';
import { useAdminTrainerSessionOptional } from '@/contexts/AdminTrainerSessionContext';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections } from '@/lib/trainingResultParser';
import { normalizeWorkoutPlan, workoutPlanToParsedDays } from '@/lib/workoutSchema';
import TrainerLogSheet from './TrainerLogSheet';
import DuoTrainerLogSheet from './DuoTrainerLogSheet';
import AdminTrainerSessionBanner from './AdminTrainerSessionBanner';

const AdminTrainerSessionMount: React.FC = () => {
  const ctx = useAdminTrainerSessionOptional();
  const active = ctx?.active ?? null;
  const isOpen = ctx?.isOpen ?? false;
  const close = ctx?.close ?? (() => {});
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

  // Dias do plano: prioriza o JSON v2 (carrega `exercise.id`), markdown é fallback legacy.
  const planDays = React.useMemo(() => {
    if (!plan) return [];
    const json = normalizeWorkoutPlan(plan.conteudo_json);
    if (json && json.days.length > 0) return workoutPlanToParsedDays(json);
    return parseTrainingSections(plan.conteudo || '').flatMap((s) => s.days || []);
  }, [plan]);

  if (!active) return null;

  return (
    <>
      <AdminTrainerSessionBanner />
      {isOpen && plan && active.mode === 'individual' && (
        <TrainerLogSheet
          open
          onOpenChange={(v) => { if (!v) close(); }}
          studentId={active.students[0].id}
          days={planDays}
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