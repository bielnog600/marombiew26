import { describe, it, expect } from 'vitest';
import { decideDietAction } from '@/lib/dietDecisionEngine';

describe('dietDecisionEngine — 8 scenarios', () => {
  it('1) progresso adequado (cutting saudável)', () => {
    const r = decideDietAction({
      goal: 'cutting',
      energia: 'normal',
      performance: 'igual',
      adesao: 'alta',
      fome: 'moderada',
      weightDeltaKg: -0.4,
      weeksBetweenWeights: 1,
    });
    expect(r.scenario).toBe('progresso_adequado');
    expect(r.action).toBe('manter');
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('2) estagnação com boa aderência', () => {
    const r = decideDietAction({
      goal: 'cutting',
      energia: 'normal',
      performance: 'igual',
      adesao: 'alta',
      weightDeltaKg: 0,
      weeksBetweenWeights: 3,
    });
    expect(r.scenario).toBe('estagnacao');
    expect(r.action).toBe('atualizar_dieta');
  });

  it('3) fome alta com performance preservada', () => {
    const r = decideDietAction({
      goal: 'cutting',
      fome: 'alta',
      energia: 'normal',
      performance: 'igual',
      adesao: 'alta',
    });
    expect(r.scenario).toBe('fome_alta_performance_ok');
    expect(r.action).toBe('reduzir_densidade');
  });

  it('4) queda de performance', () => {
    const r = decideDietAction({
      goal: 'cutting',
      performance: 'piorou',
      energia: 'normal',
      adesao: 'alta',
      fome: 'moderada',
    });
    expect(r.scenario).toBe('queda_performance');
    expect(r.action).toBe('atualizar_dieta');
  });

  it('5) baixa aderência', () => {
    const r = decideDietAction({
      goal: 'cutting',
      adesao: 'baixa',
      energia: 'normal',
      performance: 'igual',
    });
    expect(r.scenario).toBe('baixa_aderencia');
    expect(r.action).toBe('atualizar_dieta');
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('6) retenção alta (cintura caiu sem peso mover) = recomposição', () => {
    const r = decideDietAction({
      goal: 'cutting',
      adesao: 'alta',
      energia: 'normal',
      performance: 'igual',
      weightDeltaKg: 0,
      weeksBetweenWeights: 3,
      waistDeltaCm: -1.2,
      retencao: 'alta',
    });
    expect(r.scenario).toBe('progresso_adequado');
    expect(r.action).toBe('manter');
  });

  it('7) déficit agressivo demais', () => {
    const r = decideDietAction({
      goal: 'cutting',
      adesao: 'alta',
      energia: 'baixa',
      fome: 'alta',
      performance: 'igual',
      weightDeltaKg: -1.5,
      weeksBetweenWeights: 1,
    });
    expect(r.scenario).toBe('deficit_agressivo');
    expect(r.action).toBe('aliviar_agressividade');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('8) revisão manual (sinais insuficientes)', () => {
    const r = decideDietAction({ goal: 'manutencao' });
    expect(r.scenario).toBe('revisar_manual');
    expect(r.action).toBe('revisar_manual');
    expect(r.confidence).toBeLessThan(0.6);
  });

  it('cenários distintos têm scenario diferentes entre si', () => {
    const cases = [
      decideDietAction({ goal: 'cutting', energia: 'normal', performance: 'igual', adesao: 'alta', weightDeltaKg: -0.4, weeksBetweenWeights: 1 }),
      decideDietAction({ goal: 'cutting', adesao: 'alta', weightDeltaKg: 0, weeksBetweenWeights: 3, energia: 'normal', performance: 'igual' }),
      decideDietAction({ goal: 'cutting', fome: 'alta', energia: 'normal', performance: 'igual', adesao: 'alta' }),
      decideDietAction({ goal: 'cutting', performance: 'piorou', energia: 'normal', adesao: 'alta' }),
      decideDietAction({ goal: 'cutting', adesao: 'baixa' }),
      decideDietAction({ goal: 'cutting', adesao: 'alta', energia: 'baixa', fome: 'alta', weightDeltaKg: -1.5, weeksBetweenWeights: 1 }),
      decideDietAction({ goal: 'manutencao' }),
    ];
    const uniq = new Set(cases.map((c) => c.scenario));
    expect(uniq.size).toBeGreaterThanOrEqual(5);
  });

  it('confiança diferencia caso sólido vs ambíguo', () => {
    const solido = decideDietAction({ goal: 'cutting', adesao: 'baixa' });
    const ambiguo = decideDietAction({ goal: 'manutencao' });
    expect(solido.confidence).toBeGreaterThan(ambiguo.confidence);
  });
});