import { describe, expect, it } from 'vitest';
import {
  compareConsultoriaCycleStudents,
  getCycleInfo,
  matchesConsultoriaStudentFilter,
  normalizeConsultoriaTab,
  planBaseDate,
  studentRisk,
  workoutAdherence,
} from '@/lib/consultoriaMetrics';

const NOW = new Date('2026-11-24T12:00:00Z');

describe('abas da Consultoria', () => {
  it('inicia no Dashboard e redireciona Alertas/Fichas antigos', () => {
    expect(normalizeConsultoriaTab(null)).toBe('dashboard');
    expect(normalizeConsultoriaTab('alertas')).toBe('dashboard');
    expect(normalizeConsultoriaTab('fichas')).toBe('dashboard');
    expect(normalizeConsultoriaTab('treinos')).toBe('treinos');
  });
});

describe('data base e ciclo de 45 dias', () => {
  it('usa a data do título mesmo quando a republicação foi criada hoje', () => {
    const base = planBaseDate('Dieta - 10/10/2026', NOW.toISOString());
    expect(getCycleInfo(base, NOW)).toMatchObject({ days: 45, remaining: 0, status: 'vencido' });
  });

  it('aceita Treino com hífen tipográfico', () => {
    expect(planBaseDate('Treino — 01/11/2026', NOW.toISOString())).toBe(new Date(2026, 10, 1, 12).toISOString());
  });

  it('usa created_at quando o título não tem data válida', () => {
    expect(planBaseDate('Plano de hipertrofia', NOW.toISOString())).toBe(NOW.toISOString());
    expect(planBaseDate('Dieta - 31/02/2026', NOW.toISOString())).toBe(NOW.toISOString());
  });

  it('marca atenção a partir de 35 dias', () => {
    expect(getCycleInfo(planBaseDate('Treino - 20/10/2026', '2026-10-20'), NOW)).toMatchObject({ days: 35, status: 'atencao', remaining: 10 });
  });
});

describe('aderência e risco', () => {
  it('usa a frequência semanal do plano: 4 dias e 12 sessões = 70%', () => {
    expect(workoutAdherence(12, 4)).toBe(70);
  });

  it('usa 6 dias do plano, sem divisor fixo 17', () => {
    expect(workoutAdherence(12, 6)).toBe(47);
  });

  it('sem plano usa 4x/semana e limita a 100%', () => {
    expect(workoutAdherence(10, null)).toBe(58);
    expect(workoutAdherence(100, null)).toBe(100);
  });

  const risk = (lastDays: number | null, adherence: number, planAge = 20) => studentRisk({
    lastActiveAt: lastDays === null ? null : new Date(NOW.getTime() - lastDays * 86400000).toISOString(),
    adherence,
    hasWorkoutPlan: planAge !== 0,
    workoutPlanCreatedAt: planAge === 0 ? null : new Date(NOW.getTime() - planAge * 86400000).toISOString(),
  }, NOW);

  it('alto por 5 dias sem acesso ou aderência abaixo de 25% em plano com mais de 7 dias', () => {
    expect(risk(5, 100)).toBe('alto');
    expect(risk(0, 24)).toBe('alto');
    expect(risk(null, 100)).toBe('alto');
  });

  it('médio por 3–4 dias sem acesso ou aderência de 25–49%', () => {
    expect(risk(3, 100)).toBe('medio');
    expect(risk(4, 100)).toBe('medio');
    expect(risk(0, 25)).toBe('medio');
    expect(risk(0, 49)).toBe('medio');
  });

  it('baixo para acesso recente e aderência de pelo menos 50%', () => {
    expect(risk(2, 50)).toBe('baixo');
  });

  it('não penaliza aderência de plano com até 7 dias', () => {
    expect(risk(0, 0, 7)).toBe('baixo');
  });
});

describe('filtros de alunos', () => {
  const active = { ativo: true, accessStatus: 'active' as const, risk: 'baixo' as const, adherence: 70, hasTreino: true, hasDieta: true };
  const suspended = { ...active, ativo: false, accessStatus: 'suspended' as const, hasTreino: false, hasDieta: false };

  it('Todos inclui ativos e suspensos', () => {
    expect(matchesConsultoriaStudentFilter(active, 'todos')).toBe(true);
    expect(matchesConsultoriaStudentFilter(suspended, 'todos')).toBe(true);
  });

  it('Sem treino e Sem dieta não incluem suspensos', () => {
    expect(matchesConsultoriaStudentFilter(suspended, 'sem_treino')).toBe(false);
    expect(matchesConsultoriaStudentFilter(suspended, 'sem_dieta')).toBe(false);
    expect(matchesConsultoriaStudentFilter({ ...active, hasTreino: false }, 'sem_treino')).toBe(true);
    expect(matchesConsultoriaStudentFilter({ ...active, hasDieta: false }, 'sem_dieta')).toBe(true);
  });

  it('Engajados usa risco baixo e Suspensos mantém o filtro próprio', () => {
    expect(matchesConsultoriaStudentFilter(active, 'ativos')).toBe(true);
    expect(matchesConsultoriaStudentFilter({ ...active, risk: 'medio' }, 'ativos')).toBe(false);
    expect(matchesConsultoriaStudentFilter(suspended, 'suspensos')).toBe(true);
  });
});

describe('ordenação dos ciclos', () => {
  const plan = (tipo: 'dieta' | 'treino', titulo: string) => ({ student_id: 'x', tipo, titulo, created_at: NOW.toISOString(), published_at: NOW.toISOString(), treino_days: null });
  const withPlan = { studentName: 'Ana', dieta: plan('dieta', 'Dieta - 01/10/2026'), treino: null };
  const withoutPlan = { studentName: 'Aaa Sem Plano', dieta: null, treino: null };

  it('quem não tem plano fica no fim mesmo ordenando por nome', () => {
    expect(compareConsultoriaCycleStudents(withoutPlan, withPlan, 'dieta', 'name', NOW)).toBeGreaterThan(0);
  });

  it('quem não tem plano fica no fim mesmo ordenando por vencimento', () => {
    expect(compareConsultoriaCycleStudents(withoutPlan, withPlan, 'dieta', 'overdue', NOW)).toBeGreaterThan(0);
  });
});
