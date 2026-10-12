import { describe, it, expect, vi, beforeEach } from 'vitest';

const updates: any[] = [];
const upserts: any[] = [];
const sessionRow = {
  id: 'S1', student_id: 'U1', status: 'in_progress', day_name: 'Terça',
  started_at: '2026-10-12T09:00:00Z', created_at: '2026-10-12T09:00:00Z',
  last_active_at: '2026-10-12T09:10:00Z', completed_at: null, phase: 'semana_1',
  total_exercises: 2,
  session_state: { sets: { 0: [{ completed: true, reps: 10, weight: 40 }] }, currentIndex: 1, exerciseNames: ['SUPINO', 'REMADA'], plannedSets: [3, 3] },
};

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const q: any = {
      _upd: null,
      select: () => q, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: sessionRow, error: null }),
      update: (v: any) => { updates.push({ table, v }); return q; },
      upsert: async (rows: any) => { upserts.push(rows); return { error: null }; },
      then: (r: any) => Promise.resolve({ error: null }).then(r),
    };
    return q;
  };
  return { supabase: { from: builder } };
});

import {
  decideWorkoutStart, elapsedSecondsSince, isSessionForgotten,
  resolveHomeTrainingCard, shouldShowWorkoutLoading, workoutDayLabel,
} from '@/lib/activeWorkoutSession';
import { cancelWorkoutSession } from '@/lib/workoutSessionResolution';

const now = new Date('2026-10-12T09:12:00Z').getTime(); // segunda
const tuesday = { id: 'S1', day_name: 'Terça', started_at: '2026-10-12T09:00:00Z', last_active_at: '2026-10-12T09:10:00Z' };
const days = [
  { day: 'Segunda - Peito', exercises: [] },
  { day: 'Terça - Costas', exercises: [] },
];

describe('retomar sessão de outro dia', () => {
  it('sem dia pedido (reabrir app) retoma a sessão de terça', () => {
    expect(decideWorkoutStart(tuesday, null)).toMatchObject({ kind: 'resume', session: { day_name: 'Terça' } });
  });
  it('mesmo dia (acentos/maiúsculas) retoma', () => {
    expect(decideWorkoutStart(tuesday, 'TERCA').kind).toBe('resume');
  });
  it('outro dia pergunta, nunca abre duas sessões', () => {
    const d = decideWorkoutStart(tuesday, 'Segunda');
    expect(d.kind).toBe('conflict');
    if (d.kind === 'conflict') {
      expect(d.message).toBe('Você tem o treino de TERÇA em andamento. Continuar ele ou encerrar e começar o de SEGUNDA?');
    }
  });
  it('sem sessão aberta inicia nova', () => {
    expect(decideWorkoutStart(null, 'Segunda').kind).toBe('new');
  });
});

describe('cronômetro pelo started_at', () => {
  it('conta desde o início real, mesmo com o app fechado', () => {
    expect(elapsedSecondsSince('2026-10-12T09:00:00Z', now)).toBe(720);
    expect(elapsedSecondsSince('2026-10-12T09:00:00Z', now + 3600_000)).toBe(4320);
  });
  it('nunca negativo e tolera data inválida', () => {
    expect(elapsedSecondsSince('2026-10-12T10:00:00Z', now)).toBe(0);
    expect(elapsedSecondsSince('xx', now)).toBe(0);
  });
  it('sessão esquecida só após 6 h sem atividade', () => {
    expect(isSessionForgotten(tuesday, now + 5 * 3600_000)).toBe(false);
    expect(isSessionForgotten(tuesday, new Date('2026-10-12T15:11:00Z').getTime())).toBe(true);
  });
});

describe('card Hoje', () => {
  it('mostra a sessão em andamento de terça no lugar do treino de segunda', () => {
    const card = resolveHomeTrainingCard({ activeSession: tuesday, todayTraining: days[0], trainingDays: days, now });
    expect(card.mode).toBe('active');
    if (card.mode === 'active') {
      expect(card.title).toBe('Treino em andamento · TERÇA-FEIRA · 12 min');
      expect(card.day?.day).toBe('Terça - Costas');
    }
  });
  it('sem sessão volta ao treino do dia', () => {
    expect(resolveHomeTrainingCard({ activeSession: null, todayTraining: days[0], trainingDays: days, now }))
      .toEqual({ mode: 'today', day: days[0] });
  });
  it('rótulo do dia', () => {
    expect(workoutDayLabel('Terça - Costas')).toBe('TERÇA-FEIRA');
    expect(workoutDayLabel('Treino A')).toBe('TREINO A');
  });
});

describe('cancelar sessão', () => {
  beforeEach(() => { updates.length = 0; upserts.length = 0; });
  it('marca abandonada e mantém as séries no histórico', async () => {
    expect(await cancelWorkoutSession('S1')).toBe(true);
    const upd = updates.find((u) => u.table === 'workout_sessions');
    expect(upd.v.status).toBe('abandoned');
    expect(upd.v.completion_source).toBe('manual');
    expect(upserts.flat().length).toBeGreaterThan(0);
  });
});

describe('tela de execução: carregamento da retomada', () => {
  it('durante o carregamento nunca mostra o estado vazio', () => {
    expect(shouldShowWorkoutLoading(true, false)).toBe(true);
  });
  it('carregamento terminou sem exercício: estado vazio pode aparecer', () => {
    expect(shouldShowWorkoutLoading(false, false)).toBe(false);
  });
  it('com exercício pronto a tela segue normal, mesmo com carga pendente', () => {
    expect(shouldShowWorkoutLoading(false, true)).toBe(false);
    expect(shouldShowWorkoutLoading(true, true)).toBe(false);
  });
});
