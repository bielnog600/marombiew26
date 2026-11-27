import { describe, it, expect } from 'vitest';
import { currentCyclePlans, planForPhase } from '@/lib/currentCyclePlans';
import { shouldApplyLivePlan } from '@/lib/livePlanUpdate';
import { resolveCurrentTrainingPhase } from '@/lib/currentPhase';

const plans = [
  { id: 'nov', fase: 'semana_2', fase_inicio_data: '2026-11-15', is_draft: false },
  { id: 'out', fase: 'semana_3', fase_inicio_data: '2026-10-12', is_draft: false },
  { id: 'set', fase: 'semana_1', fase_inicio_data: '2026-09-03', is_draft: false },
];

describe('plano do ciclo atual', () => {
  it('plano antigo semana_3 de outro ciclo nunca vira o treino atual', () => {
    const cycle = currentCyclePlans(plans);
    expect(cycle.map((p) => p.id)).toEqual(['nov']);
    expect(planForPhase(cycle, 'semana_3')?.id).toBe('nov');
    expect(planForPhase(cycle, 'semana_2')?.id).toBe('nov');
  });

  it('a fase do plano atual pela timeline é semana_2 em 27/11', () => {
    expect(resolveCurrentTrainingPhase(plans[0] as any, new Date(2026, 10, 27)).phase).toBe('semana_2');
    expect(resolveCurrentTrainingPhase(plans[0] as any, new Date(2026, 10, 18)).phase).toBe('semana_1');
  });

  it('mantém fases do mesmo ciclo e ignora rascunhos', () => {
    const list = [
      { id: 'draft', fase: 'semana_4', fase_inicio_data: '2026-11-20', is_draft: true },
      { id: 'a2', fase: 'semana_2', fase_inicio_data: '2026-11-15' },
      { id: 'a1', fase: 'semana_1', fase_inicio_data: '2026-11-15' },
      { id: 'old', fase: 'semana_3', fase_inicio_data: '2026-10-12' },
    ];
    expect(currentCyclePlans(list).map((p) => p.id)).toEqual(['a2', 'a1']);
  });
});

describe('atualização ao vivo', () => {
  it('plano novo não troca exercícios no meio da sessão', () => {
    expect(shouldApplyLivePlan('nov', 'dez')).toBe(false);
    expect(shouldApplyLivePlan(null, 'nov')).toBe(false);
    expect(shouldApplyLivePlan('nov', 'nov')).toBe(true);
  });
});
