import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import {
  buildAdherenceReport,
  getPreviousWeekWindow,
  type AdherenceReport,
} from '@/lib/weeklyAdherence';
import {
  buildProgressionReport,
  getProgressionWindows,
  type ProgressionReport,
  type ExerciseLog,
} from '@/lib/weeklyProgression';

export type AttentionKind =
  | 'regressao'
  | 'sem_progresso'
  | 'dados_insuficientes'
  | 'baixa_aderencia'
  | 'reanalisar'
  | 'ok';

export interface StudentWeeklySummary {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  planId: string | null;
  planContent: string | null;
  adherence: AdherenceReport | null;
  progression: ProgressionReport | null;
  attention: AttentionKind;
  priority: number; // menor = mais urgente
  actionLabel: string;
}

const classify = (
  adherence: AdherenceReport | null,
  progression: ProgressionReport | null,
): { kind: AttentionKind; priority: number; action: string } => {
  if (!adherence || !progression) {
    return { kind: 'dados_insuficientes', priority: 3, action: 'Sem plano de treino ativo ou sem registros.' };
  }
  if (progression.regressed.length > 0) {
    return { kind: 'regressao', priority: 0, action: 'Investigar queda de carga/reps e ajustar plano.' };
  }
  if (adherence.status === 'sugerir_reanalise') {
    return { kind: 'reanalisar', priority: 1, action: 'Reanalisar plano — registros confusos.' };
  }
  if (adherence.status === 'dados_insuficientes') {
    return { kind: 'dados_insuficientes', priority: 1, action: 'Cobrar registro de carga/reps.' };
  }
  if (adherence.status === 'repetir_semana') {
    return { kind: 'baixa_aderencia', priority: 2, action: 'Repetir semana e cobrar presença.' };
  }
  if (adherence.status === 'manter_semana') {
    return { kind: 'baixa_aderencia', priority: 2, action: 'Manter semana atual.' };
  }
  if (adherence.status === 'apto_avancar' && progression.improved.length === 0) {
    return { kind: 'sem_progresso', priority: 2, action: 'Liberar progressão de carga.' };
  }
  return { kind: 'ok', priority: 4, action: 'Liberar progressão de carga.' };
};

export const useStudentsWeeklySummary = () => {
  const [summaries, setSummaries] = useState<StudentWeeklySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. alunos ativos
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'aluno');
      const allIds = (roles ?? []).map((r) => r.user_id);
      if (allIds.length === 0) { setSummaries([]); return; }
      const { data: actives } = await supabase
        .from('students_profile')
        .select('user_id')
        .eq('ativo', true)
        .in('user_id', allIds);
      const ids = (actives ?? []).map((a) => a.user_id);
      if (ids.length === 0) { setSummaries([]); return; }

      // 2. perfis (nome, telefone)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome, telefone')
        .in('user_id', ids);

      // 3. último plano de treino ativo de cada aluno
      const { data: plans } = await supabase
        .from('ai_plans')
        .select('id, student_id, conteudo, created_at')
        .eq('tipo', 'treino')
        .eq('is_draft', false)
        .in('student_id', ids)
        .order('created_at', { ascending: false });
      const latestPlan = new Map<string, { id: string; conteudo: string | null }>();
      for (const p of plans ?? []) {
        if (!latestPlan.has(p.student_id)) {
          latestPlan.set(p.student_id, { id: p.id, conteudo: p.conteudo });
        }
      }

      // 4. logs de duas semanas
      const { lastStart, lastEnd, prevStart, prevEnd } = getProgressionWindows();
      const { start: adhStart, end: adhEnd } = getPreviousWeekWindow();
      const { data: logs } = await supabase
        .from('exercise_set_logs')
        .select('student_id, exercise_name, reps, weight_kg, performed_at')
        .in('student_id', ids)
        .gte('performed_at', prevStart.toISOString())
        .lt('performed_at', lastEnd.toISOString());

      const logsByStudent = new Map<string, ExerciseLog[]>();
      for (const l of logs ?? []) {
        if (!logsByStudent.has(l.student_id)) logsByStudent.set(l.student_id, []);
        logsByStudent.get(l.student_id)!.push({
          exercise_name: l.exercise_name,
          reps: l.reps,
          weight_kg: l.weight_kg,
          performed_at: l.performed_at,
        });
      }

      const result: StudentWeeklySummary[] = [];
      for (const p of profiles ?? []) {
        const plan = latestPlan.get(p.user_id) ?? null;
        const allLogs = logsByStudent.get(p.user_id) ?? [];
        const lastLogs = allLogs.filter((l) => new Date(l.performed_at) >= lastStart && new Date(l.performed_at) < lastEnd);
        const prevLogs = allLogs.filter((l) => new Date(l.performed_at) >= prevStart && new Date(l.performed_at) < prevEnd);

        let plannedDays: ParsedTrainingDay[] = [];
        if (plan?.conteudo) {
          plannedDays = parseTrainingSections(plan.conteudo).flatMap((s) => s.days || []);
        }

        let adherence: AdherenceReport | null = null;
        let progression: ProgressionReport | null = null;
        if (plan) {
          adherence = buildAdherenceReport(
            plannedDays,
            lastLogs.filter((l) => new Date(l.performed_at) >= adhStart && new Date(l.performed_at) < adhEnd),
            adhStart,
            adhEnd,
          );
          progression = buildProgressionReport(lastLogs, prevLogs, plannedDays);
        }

        const c = classify(adherence, progression);

        result.push({
          studentId: p.user_id,
          studentName: p.nome || 'Sem nome',
          studentPhone: p.telefone ?? null,
          planId: plan?.id ?? null,
          planContent: plan?.conteudo ?? null,
          adherence,
          progression,
          attention: c.kind,
          priority: c.priority,
          actionLabel: c.action,
        });
      }

      result.sort((a, b) => a.priority - b.priority || a.studentName.localeCompare(b.studentName));
      setSummaries(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { summaries, loading, reload: load };
};