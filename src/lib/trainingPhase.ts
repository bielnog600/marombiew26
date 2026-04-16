/**
 * Periodização semanal de treinos.
 * Estrutura preparada para futura expansão (mensal, mesociclos).
 */

export type TrainingPhase = 'semana_1' | 'semana_2' | 'semana_3' | 'deload';

export const TRAINING_PHASES: TrainingPhase[] = ['semana_1', 'semana_2', 'semana_3', 'deload'];

export const PHASE_LABELS: Record<TrainingPhase, string> = {
  semana_1: 'Semana 1 — Base Técnica',
  semana_2: 'Semana 2 — Intensificação',
  semana_3: 'Semana 3 — Overload',
  deload: 'Semana 4 — Deload',
};

/** Subtítulo curto (usado em badges e cards). */
export const PHASE_SHORT_LABELS: Record<TrainingPhase, string> = {
  semana_1: 'Semana 1',
  semana_2: 'Semana 2',
  semana_3: 'Semana 3',
  deload: 'Deload',
};

export const PHASE_DESCRIPTIONS: Record<TrainingPhase, string> = {
  semana_1: 'Base Técnica e Adaptação — cargas conservadoras, técnica perfeita, longe da falha.',
  semana_2: 'Intensificação — proximidade da falha + técnicas avançadas (drop-set, rest-pause, myo-reps).',
  semana_3: 'Overload — progressão real: mais carga, mais reps ou mais densidade.',
  deload: 'Deload — recuperação ativa: menos volume, menos intensidade, sem técnicas avançadas.',
};

/** Frase curta de foco semanal — exibida na execução do treino. */
export const PHASE_FOCUS: Record<TrainingPhase, string> = {
  semana_1: 'Foco em técnica e ajuste de carga',
  semana_2: 'Foco em intensificação e esforço',
  semana_3: 'Foco em progressão e overload',
  deload: 'Foco em recuperação e deload',
};

export const getPhaseFocus = (phase?: string | null): string =>
  PHASE_FOCUS[(phase as TrainingPhase) || 'semana_1'] ?? '';

/** Mensagem explicativa longa exibida ao aluno na execução do treino. */
export const PHASE_OBJECTIVE: Record<TrainingPhase, string> = {
  semana_1: 'Objetivo da semana: ajustar cargas, priorizar técnica e controlar a execução. Não precisa buscar falha extrema.',
  semana_2: 'Objetivo da semana: aumentar a intensidade do treino. Use as técnicas propostas com mais esforço e aproxime-se mais da falha técnica, mantendo boa execução.',
  semana_3: 'Objetivo da semana: buscar progressão real. Tente subir um pouco a carga ou fazer mais repetições com a mesma carga, sem perder qualidade de movimento.',
  deload: 'Objetivo da semana: reduzir fadiga e recuperar articulações e sistema nervoso. Treine com mais folga, menos agressividade e máxima qualidade técnica.',
};

/** Calcula a fase com base no dia do mês atual (1-7=S1, 8-14=S2, 15-21=S3, 22+=Deload). */
export const getPhaseByMonthDay = (date: Date = new Date()): TrainingPhase => {
  const day = date.getDate();
  if (day <= 7) return 'semana_1';
  if (day <= 14) return 'semana_2';
  if (day <= 21) return 'semana_3';
  return 'deload';
};

export const getPhaseObjective = (phase?: string | null): string =>
  PHASE_OBJECTIVE[(phase as TrainingPhase) || getPhaseByMonthDay()] ?? '';

/** Diretriz operacional resumida — exibida ao aluno na execução. */
export const PHASE_GUIDELINES: Record<TrainingPhase, string> = {
  semana_1: 'Foque em execução perfeita e conexão mente-músculo. Deixe 2–3 reps na reserva. Evite falha.',
  semana_2: 'Aproxime-se da falha técnica. Aplique drop-set, rest-pause ou myo-reps nos exercícios marcados.',
  semana_3: 'Supere a semana anterior: +carga, +reps ou menos descanso. Mantenha execução segura.',
  deload: 'Reduza volume (~40–50%) e intensidade. Sem técnicas avançadas. Saia das séries com folga.',
};

/** Cor do badge de fase (usa tokens semânticos). */
export const PHASE_BADGE_CLASS: Record<TrainingPhase, string> = {
  semana_1: 'bg-primary/15 text-primary border-primary/30',
  semana_2: 'bg-primary/25 text-primary border-primary/40',
  semana_3: 'bg-primary text-primary-foreground border-primary',
  deload: 'bg-muted text-muted-foreground border-border',
};

export const getPhaseLabel = (phase?: string | null): string =>
  PHASE_LABELS[(phase as TrainingPhase) || 'semana_1'] ?? 'Semana 1';

export const getPhaseShortLabel = (phase?: string | null): string =>
  PHASE_SHORT_LABELS[(phase as TrainingPhase) || 'semana_1'] ?? 'Semana 1';

export const getPhaseGuideline = (phase?: string | null): string =>
  PHASE_GUIDELINES[(phase as TrainingPhase) || 'semana_1'] ?? '';

/** Parse seguro de data ISO (YYYY-MM-DD) ou DD/MM/YYYY usando UTC para evitar bugs de fuso. */
const parseDateUTC = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const dmy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let y = parseInt(dmy[3]);
    if (y < 100) y += 2000;
    return new Date(Date.UTC(y, parseInt(dmy[2]) - 1, parseInt(dmy[1])));
  }
  return null;
};

/**
 * Calcula a fase atual a partir da data de início do ciclo de 4 semanas.
 * Semana 1 → 2 → 3 → Deload, e repete. Usa UTC para consistência.
 */
export const calculateCurrentPhase = (startDate?: string | null): TrainingPhase => {
  const start = parseDateUTC(startDate || '');
  if (!start) return 'semana_1';
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayUTC - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'semana_1';
  const weekInCycle = Math.floor(diffDays / 7) % 4;
  return TRAINING_PHASES[weekInCycle];
};

/** Retorna info amigável da fase calculada para mostrar ao admin/aluno. */
export const getPhasePreview = (startDate?: string | null): { phase: TrainingPhase; daysIn: number; weekOfCycle: number } | null => {
  const start = parseDateUTC(startDate || '');
  if (!start) return null;
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((todayUTC - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { phase: 'semana_1', daysIn: 0, weekOfCycle: 1 };
  const weekInCycle = Math.floor(diffDays / 7) % 4;
  return {
    phase: TRAINING_PHASES[weekInCycle],
    daysIn: diffDays,
    weekOfCycle: weekInCycle + 1,
  };
};
