import type { StudentWeeklySummary } from '@/hooks/useStudentsWeeklySummary';

const firstName = (full: string) => (full || 'aluno').split(' ')[0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (items: string[], max = 2) => {
  const arr = items.slice(0, max);
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  return arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
};

/**
 * Gera um parágrafo curto, direto e acionável com orientação para a próxima
 * sessão/semana do aluno, baseado em aderência + progressão da semana.
 */
export const buildNextSessionGuidance = (s: StudentWeeklySummary): string => {
  const name = firstName(s.studentName);
  const a = s.adherence;
  const p = s.progression;

  if (!a || !p) {
    return `Sem plano ativo ou sem registros suficientes para ${name}. Próxima sessão: cobrar registro de carga e reps em todos os exercícios para gerar base de progressão.`;
  }

  const parts: string[] = [];

  // 1. Direção da semana
  switch (a.status) {
    case 'apto_avancar':
      parts.push(p.improved.length > 0
        ? `${cap(name)}, semana boa — pode avançar.`
        : `${cap(name)}, aderência ok, mas sem evolução clara — avance com cautela.`);
      break;
    case 'manter_semana':
      parts.push(`${cap(name)}, manter a semana atual e consolidar execução.`);
      break;
    case 'repetir_semana':
      parts.push(`${cap(name)}, repetir a semana — aderência ficou baixa.`);
      break;
    case 'sugerir_reanalise':
      parts.push(`${cap(name)}, registros confusos — vou reanalisar o plano antes de progredir.`);
      break;
    case 'dados_insuficientes':
      parts.push(`${cap(name)}, faltou registro de carga/reps — sem base para progredir.`);
      break;
  }

  // 2. Exercícios que evoluíram → aumentar carga / topo da faixa
  // Prioriza a recomendação determinística por exercício (weeklyProgression);
  // se ainda não houver performances estruturadas, usa o contrato legado.
  const readyForLoad = (p.performances || [])
    .filter((perf) => perf.nextAction === 'increase_load')
    .slice(0, 2)
    .map((perf) => perf.exerciseName);
  const improvedTop = readyForLoad.length > 0
    ? readyForLoad
    : p.improved
        .filter((d) => d.weightDelta > 0 || d.repsDelta > 0)
        .slice(0, 2)
        .map((d) => d.exercise);
  if (improvedTop.length > 0 && a.status !== 'repetir_semana') {
    parts.push(`Na próxima sessão, subir carga ou buscar o topo da faixa em ${list(improvedTop)}.`);
  }

  // 3. Exercícios que regrediram → manter/reduzir e ajustar execução
  const regressedTop = p.regressed.slice(0, 2).map((d) => d.exercise);
  if (regressedTop.length > 0) {
    parts.push(`Em ${list(regressedTop)}, manter (ou reduzir) a carga e focar em amplitude e controle.`);
  }

  // 4. Sem registros
  const missingTop = (p.missing || []).slice(0, 2);
  if (missingTop.length > 0) {
    parts.push(`Sem base confiável em ${list(missingTop)} — pedir para registrar carga e reps na próxima sessão.`);
  }

  // 5. Fechamento conservador quando aderência baixa
  if (a.status === 'repetir_semana' || a.status === 'manter_semana') {
    if (improvedTop.length === 0 && regressedTop.length === 0) {
      parts.push('Semana conservadora: mesmo plano, foco em presença e execução.');
    }
  }

  return parts.join(' ');
};
// ============================================================
// Orientação por exercício (determinística, a partir de nextAction)
// ------------------------------------------------------------
// Consome as `nextAction` já calculadas em weeklyProgression. Nenhuma nova
// regra de progressão é criada aqui e NENHUM incremento quantitativo de carga
// (+2.5 kg, +5%) é sugerido — isso é etapa posterior.
// ============================================================

import type { ExercisePerformance } from '@/lib/weeklyProgression';
import type { TrainingPhase } from '@/lib/trainingPhase';

export interface ExerciseGuidance {
  exerciseName: string;
  nextAction: ExercisePerformance['nextAction'];
  text: string;
}

const rangeText = (p: ExercisePerformance) =>
  p.repRange ? `${p.repRange.min}–${p.repRange.max} reps` : 'faixa prescrita';

const loadText = (p: ExercisePerformance) =>
  p.bestSet && p.bestSet.weightKg > 0 ? `${p.bestSet.weightKg} kg` : 'a carga atual';

/**
 * Traduz a recomendação por exercício em texto acionável.
 * No deload, nada de sobrecarga: increase_load/increase_reps viram manutenção.
 */
export const buildExerciseGuidance = (
  performances: ExercisePerformance[] = [],
  opts: { activePhase?: TrainingPhase | null; lowConfidence?: boolean; max?: number } = {},
): ExerciseGuidance[] => {
  const deload = opts.activePhase === 'deload';
  const out: ExerciseGuidance[] = [];

  for (const p of performances) {
    // missing / insufficient_data nunca geram recomendação agressiva.
    if (p.status === 'missing' || p.status === 'insufficient_data') {
      out.push({
        exerciseName: p.exerciseName,
        nextAction: 'review',
        text: 'Sem base confiável — registre carga e repetições na próxima sessão.',
      });
      continue;
    }

    let action = p.nextAction;
    if (deload && (action === 'increase_load' || action === 'increase_reps')) action = 'maintain';

    let text: string;
    switch (action) {
      case 'increase_load':
        text = `Atingiu o topo da faixa com reserva adequada; considere pequeno aumento de carga.`;
        break;
      case 'increase_reps':
        text = `Mantenha ${loadText(p)} e tente aumentar as repetições dentro da ${rangeText(p)}.`;
        break;
      case 'reduce_load':
        text = deload
          ? 'Semana de deload: reduza a carga e priorize recuperação.'
          : 'Performance caiu de forma relevante; reduza a carga e recupere a faixa prescrita.';
        break;
      case 'maintain':
        text = deload
          ? 'Deload: mantenha carga e faixa atual, sem buscar progressão.'
          : 'Mantenha carga e faixa atual.';
        break;
      default:
        text = 'Registre a execução completa para permitir avaliação na próxima semana.';
    }

    out.push({ exerciseName: p.exerciseName, nextAction: action, text });
  }

  const ordered = out.sort((a, b) => ACTION_PRIORITY[a.nextAction] - ACTION_PRIORITY[b.nextAction]);
  return typeof opts.max === 'number' ? ordered.slice(0, opts.max) : ordered;
};

const ACTION_PRIORITY: Record<ExerciseGuidance['nextAction'], number> = {
  reduce_load: 0,
  increase_load: 1,
  increase_reps: 2,
  maintain: 3,
  review: 4,
};
