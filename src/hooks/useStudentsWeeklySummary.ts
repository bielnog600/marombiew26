import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { parseTrainingSections, type ParsedTrainingDay } from '@/lib/trainingResultParser';
import { type AdherenceReport } from '@/lib/weeklyAdherence';
import { type ProgressionReport, type WeekResolution } from '@/lib/weeklyProgression';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';
import { resolveWeekContexts, fetchRangeFor } from '@/lib/weekContext';
import {
  buildWeeklyTrainingReport,
  describeWeekDecision,
  type RawSetLog,
  type RawSession,
} from '@/lib/weeklyTraining';
import type { TrainingPhase } from '@/lib/trainingPhase';

export type AttentionKind =
  | 'regressao'
  | 'sem_progresso'
  | 'dados_insuficientes'
  | 'baixa_aderencia'
  | 'reanalisar'
  | 'ok';

export interface DietWellnessSummary {
  // últimos 7 dias de daily_tracking
  daysTracked: number;
  daysWithMeals: number;      // dias em que marcou ao menos 1 refeição
  totalMealsMarked: number;
  avgWaterGlasses: number;    // média de copos/dia nos dias registrados
  daysBelowWaterGoal: number; // dias abaixo de 6 copos
  hasDietPlan: boolean;
  // último diet_checkin respondido
  lastCheckin: {
    completed_at: string;
    fome: string | null;
    energia: string | null;
    saciedade: string | null;
    digestao: string | null;
    facilidade: string | null; // dificil | media | facil (dificuldade de ingerir)
    adesao: string | null;
    observacoes: string | null;
  } | null;
}

export interface StudentWeeklySummary {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  presencial: boolean;
  planId: string | null;
  planContent: string | null;
  adherence: AdherenceReport | null;
  progression: ProgressionReport | null;
  /** MESMA decisão exibida em MeusTreinos / StudentTrainingTab. */
  resolution: WeekResolution | null;
  decisionLabel: string;
  diet: DietWellnessSummary;
  attention: AttentionKind;
  priority: number; // menor = mais urgente
  actionLabel: string;
}

const classify = (
  adherence: AdherenceReport | null,
  progression: ProgressionReport | null,
  presencial = false,
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
    // Presencial: falta de registros pelo app é esperada — não cobrar do aluno.
    if (presencial) {
      return { kind: 'ok', priority: 4, action: 'Aluno presencial — registrar cargas/reps direto no Modo Treino.' };
    }
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

      // 2b. Detecta automaticamente alunos "presenciais": aqueles cujos
      // registros recentes vieram do admin (Modo Treino) e não do próprio
      // aluno pelo app. Última janela: 30 dias.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: sourceLogs } = await supabase
        .from('exercise_set_logs')
        .select('student_id, source')
        .in('student_id', ids)
        .gte('performed_at', thirtyDaysAgo.toISOString());
      const adminCount = new Map<string, number>();
      const studentCount = new Map<string, number>();
      for (const l of sourceLogs ?? []) {
        if ((l as any).source === 'admin') {
          adminCount.set(l.student_id, (adminCount.get(l.student_id) ?? 0) + 1);
        } else {
          studentCount.set(l.student_id, (studentCount.get(l.student_id) ?? 0) + 1);
        }
      }
      const presencialMap = new Map<string, boolean>();
      for (const id of ids) {
        const a = adminCount.get(id) ?? 0;
        const s = studentCount.get(id) ?? 0;
        // Considera presencial se, nos últimos 30 dias, houve registros do
        // admin e o aluno não registrou nada pelo app.
        presencialMap.set(id, a > 0 && s === 0);
      }

      // 3. último plano de treino ativo de cada aluno
      const { data: plans } = await supabase
        .from('ai_plans')
        .select('id, student_id, conteudo, created_at, fase, fase_inicio_data, cycle_days')
        .eq('tipo', 'treino')
        .eq('is_draft', false)
        .in('student_id', ids)
        .order('created_at', { ascending: false });
      const latestPlan = new Map<string, {
        id: string;
        conteudo: string | null;
        fase: TrainingPhase | null;
        fase_inicio_data: string | null;
        cycle_days: number | null;
      }>();
      for (const p of plans ?? []) {
        if (!latestPlan.has(p.student_id)) {
          latestPlan.set(p.student_id, {
            id: p.id,
            conteudo: p.conteudo,
            fase: (p as any).fase ?? null,
            fase_inicio_data: (p as any).fase_inicio_data ?? null,
            cycle_days: (p as any).cycle_days ?? null,
          });
        }
      }

      // Contexto semanal (semana lógica do plano) de cada aluno — puro, local.
      const contextsByStudent = new Map<string, ReturnType<typeof resolveWeekContexts>>();
      for (const [studentId, plan] of latestPlan.entries()) {
        contextsByStudent.set(studentId, resolveWeekContexts({
          planId: plan.id,
          phase: resolveCurrentTrainingPhase({
            id: plan.id,
            fase: plan.fase,
            fase_inicio_data: plan.fase_inicio_data,
            cycle_days: plan.cycle_days,
          }).phase,
          phaseStartDate: plan.fase_inicio_data,
          cycleDays: plan.cycle_days,
        }));
      }

      // 4. logs e sessões em LOTE (2 queries para todos os alunos — zero N+1).
      // Busca o superset temporal que cobre todos os contextos semanais.
      const nowMs = Date.now();
      let batchFrom = new Date(nowMs);
      let batchTo = new Date(nowMs);
      for (const ctx of contextsByStudent.values()) {
        const r = fetchRangeFor(ctx);
        if (r.from < batchFrom) batchFrom = r.from;
        if (r.to > batchTo) batchTo = r.to;
      }
      if (contextsByStudent.size === 0) batchFrom.setDate(batchFrom.getDate() - 14);

      const { data: logs } = await supabase
        .from('exercise_set_logs')
        .select('student_id, exercise_name, reps, weight_kg, rpe, rir, set_type, set_number, performed_at, phase, session_id')
        .in('student_id', ids)
        .gte('performed_at', batchFrom.toISOString())
        .lt('performed_at', batchTo.toISOString());

      const logsByStudent = new Map<string, RawSetLog[]>();
      for (const l of logs ?? []) {
        if (!logsByStudent.has(l.student_id)) logsByStudent.set(l.student_id, []);
        logsByStudent.get(l.student_id)!.push({
          exercise_name: l.exercise_name,
          reps: l.reps,
          weight_kg: l.weight_kg,
          rpe: (l as any).rpe ?? null,
          rir: (l as any).rir ?? null,
          set_type: (l as any).set_type ?? null,
          set_number: (l as any).set_number ?? null,
          performed_at: l.performed_at,
          phase: (l as any).phase ?? null,
          session_id: (l as any).session_id ?? null,
        });
      }

      const { data: sessionRows } = await supabase
        .from('workout_sessions')
        .select('id, student_id, status, completed_at, started_at, created_at, plan_id, phase')
        .in('student_id', ids)
        .in('status', ['completed', 'partial', 'abandoned'])
        .gte('completed_at', batchFrom.toISOString())
        .lt('completed_at', batchTo.toISOString());
      const sessionsByStudent = new Map<string, RawSession[]>();
      for (const s of sessionRows ?? []) {
        if (!sessionsByStudent.has(s.student_id)) sessionsByStudent.set(s.student_id, []);
        sessionsByStudent.get(s.student_id)!.push({
          id: s.id,
          status: s.status,
          completed_at: s.completed_at,
          started_at: s.started_at,
          created_at: (s as any).created_at,
          plan_id: (s as any).plan_id ?? null,
          phase: (s as any).phase ?? null,
        });
      }

      // 5. dieta ativa (existência)
      const { data: dietPlans } = await supabase
        .from('ai_plans')
        .select('student_id')
        .eq('tipo', 'dieta')
        .eq('is_draft', false)
        .in('student_id', ids);
      const hasDietSet = new Set<string>((dietPlans ?? []).map((d) => d.student_id));

      // 6. daily_tracking dos últimos 7 dias (água + refeições)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoDate = sevenDaysAgo.toISOString().slice(0, 10);
      const { data: tracking } = await supabase
        .from('daily_tracking')
        .select('student_id, date, water_glasses, meals_completed')
        .in('student_id', ids)
        .gte('date', sevenDaysAgoDate);
      const trackingByStudent = new Map<string, typeof tracking>();
      for (const t of tracking ?? []) {
        if (!trackingByStudent.has(t.student_id)) trackingByStudent.set(t.student_id, [] as any);
        (trackingByStudent.get(t.student_id) as any[]).push(t);
      }

      // 7. último diet_checkin respondido de cada aluno
      const { data: checkins } = await supabase
        .from('diet_checkins')
        .select('student_id, completed_at, fome, energia, saciedade, digestao, facilidade, adesao, observacoes')
        .in('student_id', ids)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });
      const lastCheckinByStudent = new Map<string, any>();
      for (const ch of checkins ?? []) {
        if (!lastCheckinByStudent.has(ch.student_id)) lastCheckinByStudent.set(ch.student_id, ch);
      }

      const result: StudentWeeklySummary[] = [];
      for (const p of profiles ?? []) {
        const plan = latestPlan.get(p.user_id) ?? null;
        const allLogs = logsByStudent.get(p.user_id) ?? [];

        let plannedDays: ParsedTrainingDay[] = [];
        if (plan?.conteudo) {
          plannedDays = parseTrainingSections(plan.conteudo).flatMap((s) => s.days || []);
        }

        let adherence: AdherenceReport | null = null;
        let progression: ProgressionReport | null = null;
        let resolution: WeekResolution | null = null;
        if (plan) {
          // MESMAS funções puras do aluno/admin — só a busca de dados é em lote.
          const report = buildWeeklyTrainingReport({
            plannedPhase: resolveCurrentTrainingPhase({
              id: plan.id,
              fase: plan.fase,
              fase_inicio_data: plan.fase_inicio_data,
              cycle_days: plan.cycle_days,
            }).phase,
            plannedDays,
            contexts: contextsByStudent.get(p.user_id)!,
            logs: allLogs,
            sessions: sessionsByStudent.get(p.user_id) ?? [],
            planId: plan.id,
          });
          adherence = report.adherence;
          progression = report.progression;
          resolution = report.resolution;
        }

        const isPresencial = presencialMap.get(p.user_id) ?? false;
        const cFinal = classify(adherence, progression, isPresencial);

        // Construir resumo de dieta/hidratação
        const trk = (trackingByStudent.get(p.user_id) as any[] | undefined) ?? [];
        const waterVals = trk.map((t) => Number(t.water_glasses) || 0);
        const daysWithMeals = trk.filter((t) => Array.isArray(t.meals_completed) && t.meals_completed.length > 0).length;
        const totalMealsMarked = trk.reduce(
          (acc, t) => acc + (Array.isArray(t.meals_completed) ? t.meals_completed.length : 0),
          0,
        );
        const avgWaterGlasses = waterVals.length > 0
          ? Math.round((waterVals.reduce((a, b) => a + b, 0) / waterVals.length) * 10) / 10
          : 0;
        const daysBelowWaterGoal = waterVals.filter((v) => v < 6).length;
        const lastCheckin = lastCheckinByStudent.get(p.user_id) ?? null;
        const diet: DietWellnessSummary = {
          daysTracked: trk.length,
          daysWithMeals,
          totalMealsMarked,
          avgWaterGlasses,
          daysBelowWaterGoal,
          hasDietPlan: hasDietSet.has(p.user_id),
          lastCheckin: lastCheckin ? {
            completed_at: lastCheckin.completed_at,
            fome: lastCheckin.fome,
            energia: lastCheckin.energia,
            saciedade: lastCheckin.saciedade,
            digestao: lastCheckin.digestao,
            facilidade: lastCheckin.facilidade,
            adesao: lastCheckin.adesao,
            observacoes: lastCheckin.observacoes,
          } : null,
        };

        result.push({
          studentId: p.user_id,
          studentName: p.nome || 'Sem nome',
          studentPhone: p.telefone ?? null,
          presencial: isPresencial,
          planId: plan?.id ?? null,
          planContent: plan?.conteudo ?? null,
          adherence,
          progression,
          resolution,
          decisionLabel: describeWeekDecision(resolution),
          diet,
          attention: cFinal.kind,
          priority: cFinal.priority,
          actionLabel: cFinal.action,
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