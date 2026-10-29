import { useQueryClient } from '@tanstack/react-query';
import { readConsultoriaTrainingData, CONSULTORIA_TRAINING_QUERY_KEY } from '@/lib/consultoriaTrainingData';
import { readProgressionLogs } from '@/lib/progressionHistory';
import { buildPrescribedWorkSets } from '@/lib/sessionProgression';
import { lastExerciseSessions, withPlannedSetTypes, buildExercisePerformance, repRangeFromPlanned } from '@/lib/weeklyProgression';
import { normalizeExerciseKey } from '@/lib/loadIncrement';
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
import {
  buildQuantitativeProgressionRecommendation,
  type QuantitativeRecommendation,
} from '@/lib/quantitativeProgression';
import type { VideoNeedsRedo } from '@/lib/weeklyCoachingFocus';
import { assessExerciseRegression, isNoLoadExercise, shouldTagRegression, type ExerciseRegressionAssessment } from '@/lib/consultoriaRegression';

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
  active: boolean;
  /** Recomendações quantitativas determinísticas por exercício (kg/reps reais). */
  quantitative: QuantitativeRecommendation[];
  /** Vídeos de execução marcados pelo treinador como "refazer". */
  videosNeedsRedo: VideoNeedsRedo[];
  /** Fase ativa da semana (deload bloqueia sobrecarga). */
  activePhase: TrainingPhase | null;
}


const classify = (
  adherence: AdherenceReport | null,
  progression: ProgressionReport | null,
  presencial = false,
  regressionTag = false,
): { kind: AttentionKind; priority: number; action: string } => {
  if (!adherence || !progression) {
    return { kind: 'dados_insuficientes', priority: 3, action: 'Sem plano de treino ativo ou sem registros.' };
  }
  if (regressionTag) {
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
  const queryClient = useQueryClient();
  const [summaries, setSummaries] = useState<StudentWeeklySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. alunos ativos (inativos não aparecem na lista — não buscar dados deles).
      const [{ data: roles }, shared] = await Promise.all([
        supabase.from('user_roles').select('user_id').eq('role', 'aluno'),
        readConsultoriaTrainingData(queryClient),
      ]);
      const activeSet = new Set(shared.ids);
      const ids = (roles ?? []).map((r) => r.user_id).filter((id) => activeSet.has(id));
      const studentProfileStatus = new Map<string, boolean>(ids.map((id) => [id, true]));
      if (ids.length === 0) { setSummaries([]); return; }

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoDate = sevenDaysAgo.toISOString().slice(0, 10);

      // 2. consultas independentes em paralelo.
      const [
        { data: tracking },
        { data: checkins },
        { data: redoVideos },
        { data: catalog },
      ] = await Promise.all([
        supabase
          .from('daily_tracking')
          .select('student_id, date, water_glasses, meals_completed')
          .in('student_id', ids)
          .gte('date', sevenDaysAgoDate),
        supabase
          .from('diet_checkins')
          .select('student_id, completed_at, fome, energia, saciedade, digestao, facilidade, adesao, observacoes')
          .in('student_id', ids)
          .not('completed_at', 'is', null)
          .order('completed_at', { ascending: false }),
        supabase
          .from('exercise_execution_videos')
          .select('student_id, exercise_name, admin_note, created_at, status')
          .in('student_id', ids)
          .eq('status', 'needs_redo')
          .order('created_at', { ascending: false }),
        supabase.from('exercises').select('nome, grupo_muscular, requires_load_logging'),
      ]);

      const profiles = shared.profiles.filter(p => ids.includes(p.user_id));
      const plans = shared.plans.filter(p => p.tipo === 'treino' && ids.includes(p.student_id));
      const dietPlans = shared.plans.filter(p => p.tipo === 'dieta' && ids.includes(p.student_id));

      // 3. último plano de treino ativo de cada aluno
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

      // 4. logs (paginados, só colunas usadas) e sessões em lote, em paralelo.
      const nowMs = Date.now();
      let batchFrom = new Date(nowMs);
      let batchTo = new Date(nowMs);
      for (const ctx of contextsByStudent.values()) {
        const r = fetchRangeFor(ctx);
        if (r.from < batchFrom) batchFrom = r.from;
        if (r.to > batchTo) batchTo = r.to;
      }
      if (contextsByStudent.size === 0) batchFrom.setDate(batchFrom.getDate() - 14);
      batchFrom = new Date(Math.min(batchFrom.getTime(), nowMs - 90 * 86400000));

      // Reuse shared history; rare older cycle contexts keep the original full range.
      const logs = (batchFrom.toISOString() < shared.historyStart
        ? await readProgressionLogs(ids, batchFrom.toISOString(),
          'id, student_id, exercise_name, reps, weight_kg, rpe, rir, set_type, set_number, performed_at, phase, session_id, sub_records, source')
        : shared.logs).filter(l => activeSet.has(l.student_id) && ids.includes(l.student_id) && l.performed_at >= batchFrom.toISOString());
      const sessionRows = batchFrom.toISOString() < shared.historyStart
        ? (await supabase.from('workout_sessions')
          .select('id, student_id, status, completed_at, started_at, created_at, plan_id, phase, avg_rpe')
          .in('student_id', ids).in('status', ['completed', 'partial', 'abandoned'])
          .gte('completed_at', batchFrom.toISOString()).lt('completed_at', batchTo.toISOString())).data
        : shared.sessions.filter(s => ids.includes(s.student_id)
          && ['completed', 'partial', 'abandoned'].includes(s.status)
          && s.completed_at != null && s.completed_at >= batchFrom.toISOString()
          && s.completed_at < batchTo.toISOString());

      // Presenciais: últimos 30 dias com registros do admin e nenhum do aluno pelo app.
      const thirtyDaysAgoMs = nowMs - 30 * 86400000;
      const adminCount = new Map<string, number>();
      const studentCount = new Map<string, number>();
      for (const l of logs) {
        if (new Date(l.performed_at).getTime() < thirtyDaysAgoMs) continue;
        const target = l.source === 'admin' ? adminCount : studentCount;
        target.set(l.student_id, (target.get(l.student_id) ?? 0) + 1);
      }
      const presencialMap = new Map<string, boolean>();
      for (const id of ids) {
        presencialMap.set(id, (adminCount.get(id) ?? 0) > 0 && (studentCount.get(id) ?? 0) === 0);
      }

      const logsByStudent = new Map<string, RawSetLog[]>();
      for (const l of logs) {
        if (!logsByStudent.has(l.student_id)) logsByStudent.set(l.student_id, []);
        logsByStudent.get(l.student_id)?.push({
          sub_records: l.sub_records,
          exercise_name: l.exercise_name,
          reps: l.reps,
          weight_kg: l.weight_kg,
          rpe: l.rpe ?? null,
          rir: l.rir ?? null,
          set_type: l.set_type ?? null,
          set_number: l.set_number ?? null,
          performed_at: l.performed_at,
          phase: l.phase ?? null,
          session_id: l.session_id ?? null,
        });
      }

      const sessionsByStudent = new Map<string, RawSession[]>();
      for (const s of sessionRows ?? []) {
        if (!sessionsByStudent.has(s.student_id)) sessionsByStudent.set(s.student_id, []);
        sessionsByStudent.get(s.student_id)?.push({
          avg_rpe: s.avg_rpe,
          id: s.id,
          status: s.status,
          completed_at: s.completed_at,
          started_at: s.started_at,
          created_at: (s as any).created_at,
          plan_id: (s as any).plan_id ?? null,
          phase: (s as any).phase ?? null,
        });
      }

      const hasDietSet = new Set<string>((dietPlans ?? []).map((d) => d.student_id));

      const trackingByStudent = new Map<string, typeof tracking>();
      for (const t of tracking ?? []) {
        if (!trackingByStudent.has(t.student_id)) trackingByStudent.set(t.student_id, [] as any);
        (trackingByStudent.get(t.student_id) as any[]).push(t);
      }

      const lastCheckinByStudent = new Map<string, any>();
      for (const ch of checkins ?? []) {
        if (!lastCheckinByStudent.has(ch.student_id)) lastCheckinByStudent.set(ch.student_id, ch);
      }

      const videosByStudent = new Map<string, VideoNeedsRedo[]>();
      for (const v of redoVideos ?? []) {
        const list = videosByStudent.get(v.student_id) ?? [];
        if (!list.some((x) => x.exerciseName.toLowerCase() === v.exercise_name.toLowerCase())) {
          list.push({ exerciseName: v.exercise_name, note: (v as any).admin_note ?? null });
        }
        videosByStudent.set(v.student_id, list);
      }

      // Catálogo: grupo muscular + requires_load_logging (regra de exercícios sem carga).
      const muscleByName = new Map<string, string | null>();
      const requiresLoadByName = new Map<string, boolean | null>();
      for (const c of catalog ?? []) {
        const k = normalizeExerciseKey(c.nome);
        muscleByName.set(k, c.grupo_muscular ?? null);
        requiresLoadByName.set(k, (c as any).requires_load_logging ?? null);
      }
      const noLoad = (name: string) => {
        const k = normalizeExerciseKey(name);
        return isNoLoadExercise(name, muscleByName.get(k) ?? null, requiresLoadByName.get(k) ?? null);
      };

      const result: StudentWeeklySummary[] = [];
      for (const p of profiles ?? []) {
        const plan = latestPlan.get(p.user_id) ?? null;
        const allLogs = logsByStudent.get(p.user_id) ?? [];

        let plannedDays: ParsedTrainingDay[] = [];
        if (plan?.conteudo) {
          // Exercícios sem carga não geram orientação nem contam como "sem registro".
          plannedDays = parseTrainingSections(plan.conteudo)
            .flatMap((s) => s.days || [])
            .map((d) => ({ ...d, exercises: (d.exercises ?? []).filter((e) => !noLoad(e.exercise)) }));
        }

        let adherence: AdherenceReport | null = null;
        let progression: ProgressionReport | null = null;
        let resolution: WeekResolution | null = null;
        const contexts = contextsByStudent.get(p.user_id);
        if (plan && contexts) {
          // MESMAS funções puras do aluno/admin — só a busca de dados é em lote.
          const report = buildWeeklyTrainingReport({
            plannedPhase: resolveCurrentTrainingPhase({
              id: plan.id,
              fase: plan.fase,
              fase_inicio_data: plan.fase_inicio_data,
              cycle_days: plan.cycle_days,
            }).phase,
            plannedDays,
            contexts,
            logs: allLogs,
            sessions: sessionsByStudent.get(p.user_id) ?? [],
            planId: plan.id,
          });
          adherence = report.adherence;
          progression = report.progression;
          resolution = report.resolution;
        }

        // Recomendação quantitativa (kg/reps reais) por exercício avaliado.
        const activePhase = (resolution?.activePhase ?? null) as TrainingPhase | null;
        const quantitative: QuantitativeRecommendation[] = [];
        for (const ex of plannedDays.flatMap(d => d.exercises ?? [])) {
          const history = withPlannedSetTypes(allLogs.filter(l => normalizeExerciseKey(l.exercise_name) === normalizeExerciseKey(ex.exercise)), ex);
          const pair = lastExerciseSessions(history);
          const perf = buildExercisePerformance(ex.exercise, pair.current, pair.previous, repRangeFromPlanned(ex));
          quantitative.push(buildQuantitativeProgressionRecommendation({
            performance: perf, recentLogs: pair.current, previousLogs: pair.previous, historyLogs: history,
            prescribedSets: buildPrescribedWorkSets(ex), activePhase: activePhase ?? undefined,
            sessionAvgRpe: sessionsByStudent.get(p.user_id)?.find(s => s.id === pair.current[0]?.session_id)?.avg_rpe ?? null,
          }));
        }

        // Regressão da Consultoria: critérios próprios (28 d, e1RM −10%, outliers, métodos, sem carga).
        const assessments = new Map<string, ExerciseRegressionAssessment>();
        for (const ex of plannedDays.flatMap(d => d.exercises ?? [])) {
          const key = normalizeExerciseKey(ex.exercise);
          if (assessments.has(key)) continue;
          assessments.set(key, assessExerciseRegression({
            exerciseName: ex.exercise,
            logs: withPlannedSetTypes(allLogs.filter(l => normalizeExerciseKey(l.exercise_name) === key), ex),
            planned: ex,
            muscleGroup: muscleByName.get(key) ?? null,
            requiresLoadLogging: requiresLoadByName.get(key) ?? null,
            repRange: repRangeFromPlanned(ex),
          }));
        }
        if (progression) {
          const kindOf = (name: string) => assessments.get(normalizeExerciseKey(name))?.kind;
          progression = {
            ...progression,
            regressed: progression.regressed.filter(d => kindOf(d.exercise) === 'regression'),
            performances: progression.performances
              .filter(perf => kindOf(perf.exerciseName) !== 'no_load' && !noLoad(perf.exerciseName))
              .map(perf => {
                const kind = kindOf(perf.exerciseName);
                if (kind === 'resume') return { ...perf, nextAction: 'maintain' as const, resumeReference: true };
                if (perf.nextAction === 'reduce_load' && kind !== 'regression') return { ...perf, nextAction: 'maintain' as const };
                return perf;
              }),
          };
        }

        const isPresencial = presencialMap.get(p.user_id) ?? false;
        const cFinal = classify(adherence, progression, isPresencial, shouldTagRegression([...assessments.values()]));

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
          active: studentProfileStatus.get(p.user_id) ?? false,
          quantitative,
          videosNeedsRedo: videosByStudent.get(p.user_id) ?? [],
          activePhase,
        });

      }

      result.sort((a, b) => a.priority - b.priority || a.studentName.localeCompare(b.studentName));
      setSummaries(result);
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: CONSULTORIA_TRAINING_QUERY_KEY, refetchType: 'none' });
    return load();
  }, [queryClient, load]);

  useEffect(() => { load(); }, [load]);

  return { summaries, loading, reload };
};