/**
 * Periodização semanal de treinos.
 * Estrutura preparada para futura expansão (mensal, mesociclos).
 */

export type TrainingPhase = 'semana_1' | 'semana_2' | 'semana_3' | 'deload';

export const TRAINING_PHASES: TrainingPhase[] = ['semana_1', 'semana_2', 'semana_3', 'deload'];

export const PHASE_LABELS: Record<TrainingPhase, string> = {
  semana_1: 'Semana 1',
  semana_2: 'Semana 2',
  semana_3: 'Semana 3',
  deload: 'Deload',
};

export const PHASE_DESCRIPTIONS: Record<TrainingPhase, string> = {
  semana_1: 'Acúmulo — base de volume',
  semana_2: 'Intensificação — progressão',
  semana_3: 'Pico — sobrecarga máxima',
  deload: 'Recuperação ativa — volume reduzido',
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

/**
 * Calcula a fase atual a partir da data de início do ciclo de 4 semanas.
 * Semana 1 → 2 → 3 → Deload, e repete.
 */
export const calculateCurrentPhase = (startDate?: string | null): TrainingPhase => {
  if (!startDate) return 'semana_1';
  const start = new Date(startDate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'semana_1';
  const weekInCycle = Math.floor(diffDays / 7) % 4;
  return TRAINING_PHASES[weekInCycle];
};
