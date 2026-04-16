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
