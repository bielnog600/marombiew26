/**
 * ACOMPANHAR TREINO (Consultoria → Para falar hoje → Treino de hoje)
 * =================================================================
 *
 * Camada PURA que transforma exercise_set_logs reais em um panorama por
 * exercício de um dia de treino: melhor série, última sessão, histórico
 * recente e sugestão de próxima carga.
 *
 * Regras:
 *  - carga e reps SEMPRE da MESMA série (usa selectBestSet);
 *  - aquecimento/reconhecimento nunca representam performance;
 *  - nenhuma orientação técnica é inferida automaticamente — o treinador marca;
 *  - a sugestão de próxima carga é apenas um ponto de partida editável.
 */

import { selectBestSet, type ExerciseLog, type PerformedSet } from './weeklyProgression';
import { inferIncrementFromTransitions } from './loadIncrement';

export type TrackingAction =
  | 'none'
  | 'increase_load'
  | 'increase_reps'
  | 'maintain'
  | 'reduce_load'
  | 'amplitude'
  | 'technique'
  | 'request_video';

export const TRACKING_ACTION_LABEL: Record<TrackingAction, string> = {
  none: 'Sem orientação',
  increase_load: 'Subir carga',
  increase_reps: 'Buscar mais reps',
  maintain: 'Manter',
  reduce_load: 'Reduzir carga',
  amplitude: 'Melhorar amplitude',
  technique: 'Melhorar execução',
  request_video: 'Pedir vídeo',
};

export interface TrackedSession {
  /** Chave da sessão (session_id ou data). */
  key: string;
  date: string;
  best: PerformedSet;
}

export interface ExerciseTracking {
  exerciseName: string;
  /** Melhor série já realizada na janela analisada. */
  best: PerformedSet | null;
  /** Melhor série da última sessão registrada. */
  last: PerformedSet | null;
  lastDate: string | null;
  /** Até 5 sessões recentes, da mais antiga para a mais nova. */
  recent: TrackedSession[];
  totalSets: number;
  /** Sugestão determinística de próxima carga (editável pelo treinador). */
  suggestedNextLoadKg: number | null;
}

export const normalizeExerciseName = (s: string) =>
  (s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

export const formatKg = (kg: number) => `${String(Math.round(kg * 100) / 100).replace('.', ',')} kg`;

export const formatSet = (s: PerformedSet | null): string | null => {
  if (!s) return null;
  if (s.weightKg > 0 && s.reps > 0) return `${formatKg(s.weightKg)} × ${s.reps} reps`;
  if (s.weightKg > 0) return formatKg(s.weightKg);
  if (s.reps > 0) return `${s.reps} reps`;
  return null;
};

const fallbackIncrement = (loadKg: number): number => {
  if (loadKg < 10) return 1;
  if (loadKg < 40) return 2.5;
  return 5;
};

const sessionKeyOf = (log: ExerciseLog & { session_id?: string | null }) =>
  log.session_id || String(log.performed_at ?? '').slice(0, 10);

/**
 * Monta o panorama de cada exercício do dia selecionado.
 * `exerciseNames` vem do plano ativo; logs são os do aluno na janela recente.
 */
export const buildExerciseTracking = (
  exerciseNames: string[],
  logs: (ExerciseLog & { session_id?: string | null })[],
  maxSessions = 5,
): ExerciseTracking[] => {
  const byExercise = new Map<string, (ExerciseLog & { session_id?: string | null })[]>();
  for (const l of logs) {
    const key = normalizeExerciseName(l.exercise_name);
    const list = byExercise.get(key) ?? [];
    list.push(l);
    byExercise.set(key, list);
  }

  return exerciseNames.map((name) => {
    const mine = (byExercise.get(normalizeExerciseName(name)) ?? [])
      .slice()
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime());

    const best = selectBestSet(mine) ?? null;

    const sessions = new Map<string, (ExerciseLog & { session_id?: string | null })[]>();
    for (const l of mine) {
      const k = sessionKeyOf(l);
      const list = sessions.get(k) ?? [];
      list.push(l);
      sessions.set(k, list);
    }

    const entries: TrackedSession[] = [];
    for (const [key, group] of sessions) {
      const b = selectBestSet(group);
      if (!b) continue;
      entries.push({ key, date: group[group.length - 1].performed_at, best: b });
    }
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const recent = entries.slice(-maxSessions);
    const lastEntry = entries[entries.length - 1] ?? null;

    let suggestedNextLoadKg: number | null = null;
    const baseLoad = best?.weightKg ?? 0;
    if (baseLoad > 0) {
      const inferred = inferIncrementFromTransitions(mine);
      const step = inferred.incrementKg && inferred.incrementKg > 0
        ? inferred.incrementKg
        : fallbackIncrement(baseLoad);
      suggestedNextLoadKg = Math.round((baseLoad + step) * 100) / 100;
    }

    return {
      exerciseName: name,
      best,
      last: lastEntry?.best ?? null,
      lastDate: lastEntry?.date ?? null,
      recent,
      totalSets: mine.length,
      suggestedNextLoadKg,
    };
  });
};

// ------------------------------------------------------------------
// Roteiro de áudio (natural, só com o que o treinador marcou)
// ------------------------------------------------------------------

export interface AudioSelection {
  tracking: ExerciseTracking;
  action: TrackingAction;
  /** Carga editada pelo treinador (kg) para "Subir carga". */
  nextLoadKg?: number | null;
}

const firstName = (full: string) => (full || 'aluno').trim().split(/\s+/)[0];

const lower = (s: string) => (s || '').toLocaleLowerCase('pt-BR');

const sentenceFor = (sel: AudioSelection): string | null => {
  const ex = lower(sel.tracking.exerciseName);
  const best = sel.tracking.best;
  const bestTxt = best && best.weightKg > 0 ? formatKg(best.weightKg) : null;

  switch (sel.action) {
    case 'increase_load': {
      const target = sel.nextLoadKg && sel.nextLoadKg > 0 ? formatKg(sel.nextLoadKg) : null;
      if (bestTxt && target) {
        return `No ${ex} sua melhor carga foi ${bestTxt}, então tenta subir para ${target} se estiver confortável e mantendo a execução completa`;
      }
      if (target) return `No ${ex} quero que você tente ${target} hoje, com boa execução`;
      return `No ${ex} sobe um pouco a carga, sem perder execução`;
    }
    case 'increase_reps':
      return bestTxt
        ? `No ${ex} mantém ${bestTxt} e busca mais repetições que na última vez`
        : `No ${ex} mantém a carga e busca mais repetições`;
    case 'maintain':
      return bestTxt
        ? `No ${ex} você já chegou a ${bestTxt}, então trabalha próximo dessa carga com boa execução`
        : `No ${ex} mantém a mesma carga e foca na execução`;
    case 'reduce_load':
      return `No ${ex} baixa um pouco a carga para recuperar a execução`;
    case 'amplitude':
      return `No ${ex} mantém a carga e caprichha na amplitude completa`.replace('caprichha', 'capricha');
    case 'technique':
      return `No ${ex} foca no controle do movimento, sem pressa`;
    case 'request_video':
      return `E no ${ex} me manda um vídeo de uma das séries para eu conferir`;
    case 'none':
    default:
      return null;
  }
};

export const buildTrackingAudioScript = (
  studentName: string,
  dayLabel: string,
  selections: AudioSelection[],
): string => {
  const name = firstName(studentName);
  const parts = selections.map(sentenceFor).filter((s): s is string => !!s);
  if (parts.length === 0) {
    return `${name}, bom treino hoje! Capricha na execução e me conta como foi.`;
  }
  const intro = dayLabel
    ? `${name}, no ${lower(dayLabel)} de hoje quero atenção em alguns pontos.`
    : `${name}, no treino de hoje quero atenção em alguns pontos.`;
  return `${intro} ${parts.join('. ')}. Qualquer dúvida me chama.`;
};
