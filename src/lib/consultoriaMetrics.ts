import { differenceInDays } from 'date-fns';

export const CONSULTORIA_TABS = ['dashboard', 'estudantes', 'dietas', 'treinos', 'videos', 'notificacoes'] as const;
export type ConsultoriaTab = (typeof CONSULTORIA_TABS)[number];

export function normalizeConsultoriaTab(value: string | null): ConsultoriaTab {
  return CONSULTORIA_TABS.includes(value as ConsultoriaTab) ? value as ConsultoriaTab : 'dashboard';
}

export const CYCLE_MIN_DAYS = 35;
export const CYCLE_MAX_DAYS = 45;
export type CycleStatus = 'ok' | 'atencao' | 'vencido';

export interface ConsultoriaPlanSummary {
  student_id: string;
  tipo: 'dieta' | 'treino';
  titulo: string | null;
  created_at: string;
  published_at: string | null;
  treino_days: number | null;
}

/** A republicação mantém o início original quando o título traz "Dieta/Treino - dd/mm/aaaa". */
export function planBaseDate(titulo: string | null | undefined, createdAt: string): string {
  const match = titulo?.match(/^\s*(?:dieta|treino)\s*[-–—]\s*(\d{2})\/(\d{2})\/(\d{4})(?:\D|$)/i);
  if (!match) return createdAt;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return createdAt;
  return date.toISOString();
}

export function getCycleInfo(dateStr: string | null | undefined, now: Date = new Date()) {
  if (!dateStr) return { days: 0, remaining: 0, status: 'vencido' as const, progress: 100 };
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return { days: 0, remaining: 0, status: 'vencido' as const, progress: 100 };
  const days = Math.max(0, differenceInDays(now, date));
  const remaining = Math.max(0, CYCLE_MAX_DAYS - days);
  const status: CycleStatus = days >= CYCLE_MAX_DAYS ? 'vencido' : days >= CYCLE_MIN_DAYS ? 'atencao' : 'ok';
  return { days, remaining, status, progress: Math.min(100, (days / CYCLE_MAX_DAYS) * 100) };
}

export function workoutAdherence(workouts30d: number, trainingDays: number | null | undefined): number {
  const daysPerWeek = trainingDays && trainingDays > 0 ? trainingDays : 4;
  const expected = daysPerWeek * 30 / 7;
  return Math.min(100, Math.round((Math.max(0, workouts30d) / expected) * 100));
}

export function studentRisk(params: {
  lastActiveAt: string | null;
  adherence: number;
  hasWorkoutPlan: boolean;
  workoutPlanCreatedAt: string | null;
}, now: Date = new Date()): 'baixo' | 'medio' | 'alto' {
  const daysWithoutAccess = params.lastActiveAt ? differenceInDays(now, new Date(params.lastActiveAt)) : null;
  const planAgeDays = params.workoutPlanCreatedAt ? differenceInDays(now, new Date(params.workoutPlanCreatedAt)) : null;
  const oldEnoughForAdherence = params.hasWorkoutPlan && planAgeDays !== null && planAgeDays > 7;

  if (daysWithoutAccess === null || daysWithoutAccess >= 5 || (oldEnoughForAdherence && params.adherence < 25)) return 'alto';
  if ((daysWithoutAccess !== null && daysWithoutAccess >= 3) || (oldEnoughForAdherence && params.adherence < 50)) return 'medio';
  return 'baixo';
}

export type ConsultoriaStudentFilter = 'todos' | 'risco_alto' | 'sem_treino' | 'sem_dieta' | 'baixa_aderencia' | 'ativos' | 'suspensos';

export function matchesConsultoriaStudentFilter(row: {
  ativo: boolean;
  accessStatus: 'active' | 'suspended';
  risk: 'baixo' | 'medio' | 'alto';
  adherence: number;
  hasTreino: boolean;
  hasDieta: boolean;
}, filter: ConsultoriaStudentFilter): boolean {
  if (filter === 'todos') return true;
  if (filter === 'suspensos') return row.accessStatus === 'suspended';
  if (!row.ativo || row.accessStatus === 'suspended') return false;
  if (filter === 'risco_alto') return row.risk === 'alto';
  if (filter === 'sem_treino') return !row.hasTreino;
  if (filter === 'sem_dieta') return !row.hasDieta;
  if (filter === 'baixa_aderencia') return row.adherence < 40;
  return row.risk === 'baixo';
}

export function compareConsultoriaCycleStudents(
  a: { studentName: string; dieta: ConsultoriaPlanSummary | null; treino: ConsultoriaPlanSummary | null },
  b: { studentName: string; dieta: ConsultoriaPlanSummary | null; treino: ConsultoriaPlanSummary | null },
  kind: 'dieta' | 'treino',
  sort: 'name' | 'overdue',
  now: Date = new Date(),
): number {
  const planA = a[kind];
  const planB = b[kind];
  if (!planA && planB) return 1;
  if (planA && !planB) return -1;
  if (!planA && !planB) return a.studentName.localeCompare(b.studentName);
  if (sort === 'name') return a.studentName.localeCompare(b.studentName);
  const daysA = getCycleInfo(planBaseDate(planA!.titulo, planA!.created_at), now).days;
  const daysB = getCycleInfo(planBaseDate(planB!.titulo, planB!.created_at), now).days;
  return daysB - daysA || a.studentName.localeCompare(b.studentName);
}
