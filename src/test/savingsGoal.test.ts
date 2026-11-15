import { describe, it, expect } from 'vitest';
import {
  gridSizeForGoal, gridTotal, planForGoal, describePlan, goalFromMonthly, goalProgress,
  previewGoalChange, drawUndeposited, expectedByToday, elapsedFraction, savedByMonth,
  formatEuro, defaultGoalId, validateGoalDraft, type SavingsDeposit,
} from '@/lib/savingsGoal';

const dep = (valor: number, depositado_em = '2027-01-10'): SavingsDeposit => ({ id: `d${valor}`, goal_id: 'g', valor, depositado_em });

describe('N da grade (menor N com soma ≥ meta)', () => {
  it('40.000 € → 283 (soma 40.186 €)', () => {
    expect(gridSizeForGoal(40000)).toBe(283);
    expect(gridTotal(283)).toBe(40186);
  });
  it('12.000 € → 155 (soma 12.090 €), não 154 (11.935 € fica abaixo)', () => {
    expect(gridTotal(154)).toBe(11935);
    expect(gridSizeForGoal(12000)).toBe(155);
    expect(gridTotal(155)).toBe(12090);
  });
  it('meta igual a uma soma exata usa esse N', () => {
    expect(gridSizeForGoal(gridTotal(100))).toBe(100);
    expect(gridSizeForGoal(gridTotal(100) + 1)).toBe(101);
  });
});

describe('plano da meta no ano', () => {
  it('40.000 € em 2027 → texto com média, ritmo e por dia', () => {
    const plan = planForGoal(40000, '2027-01-01', '2027-12-31');
    expect(describePlan(plan)).toBe('283 depósitos de 1 € a 283 € · total 40.186 € · média 3.349 €/mês · ~24 depósitos/mês · ~110 €/dia');
  });
  it('1.000 €/mês no ano → meta 12.000 € e N 155', () => {
    expect(goalFromMonthly(1000, '2027-01-01', '2027-12-31')).toEqual({ meta: 12000, n: 155, total: 12090 });
  });
  it('formato em euros com ponto de milhar', () => {
    expect(formatEuro(40186)).toBe('40.186 €');
    expect(formatEuro(3348.83)).toBe('3.349 €');
  });
});

describe('ritmo esperado', () => {
  it('esperado = meta × fração do período passada', () => {
    expect(elapsedFraction('2027-01-01', '2027-12-31', '2026-12-31')).toBe(0);
    expect(expectedByToday(36500, '2027-01-01', '2027-12-31', '2027-01-10')).toBeCloseTo(1000, 5);
    expect(elapsedFraction('2027-01-01', '2027-12-31', '2028-02-01')).toBe(1);
  });
  it('abaixo do ritmo e quanto falta por mês até ao fim', () => {
    const p = goalProgress({ meta_valor: 36500, inicio: '2027-01-01', fim: '2027-12-31' }, [dep(100), dep(200)], '2027-01-10');
    expect(p.onPace).toBe(false);
    expect(p.behindBy).toBeCloseTo(700, 5);
    expect(p.monthsLeft).toBe(12);
    expect(p.neededPerMonth).toBeCloseTo((gridTotal(p.n) - 300) / 12, 5);
  });
  it('no ritmo quando guardado ≥ esperado', () => {
    const p = goalProgress({ meta_valor: 365, inicio: '2027-01-01', fim: '2027-12-31' }, [dep(20)], '2027-01-10');
    expect(p.onPace).toBe(true);
    expect(p.behindBy).toBe(0);
  });
});

describe('mudar a meta mantém os depósitos', () => {
  const before = { meta_valor: 40000, inicio: '2027-01-01', fim: '2027-12-31', max_valor: 283 };
  const deposits = [dep(5), dep(150), dep(200), dep(283)];

  it('baixar a meta recalcula N e totais e manda os valores acima de N para fora da grade', () => {
    const after = { meta_valor: 12000, inicio: '2027-01-01', fim: '2027-12-31' };
    const prev = previewGoalChange(before, after, deposits, '2027-03-01');
    expect(prev.before.n).toBe(283);
    expect(prev.after.n).toBe(155);
    expect(prev.after.total).toBe(12090);
    expect(prev.before.outsideCount).toBe(0);
    expect(prev.after.outsideCount).toBe(2);
    expect(prev.after.outsideSum).toBe(483);
    expect(prev.savedUnchanged).toBe(638);
    expect(prev.after.remaining).toBe(12090 - 155);
  });

  it('depósitos fora da grade continuam a contar no guardado', () => {
    const p = goalProgress({ meta_valor: 12000, inicio: '2027-01-01', fim: '2027-12-31', max_valor: 155 }, deposits, '2027-03-01');
    expect(p.saved).toBe(638);
    expect(p.outside.map(d => d.valor)).toEqual([200, 283]);
    expect(p.doneInGrid).toBe(2);
    expect(p.remainingCount).toBe(153);
  });

  it('subir a meta de volta traz os valores para dentro da grade', () => {
    const p = goalProgress({ meta_valor: 40000, inicio: '2027-01-01', fim: '2027-12-31', max_valor: 283 }, deposits, '2027-03-01');
    expect(p.outside).toHaveLength(0);
    expect(p.doneInGrid).toBe(4);
  });
});

describe('sorteio do valor de hoje', () => {
  it('só sorteia entre os não depositados', () => {
    const done = [1, 2, 3, 5];
    for (let i = 0; i < 50; i++) {
      const v = drawUndeposited(6, done, () => i / 50)!;
      expect([4, 6]).toContain(v);
    }
  });
  it('grade completa → null', () => {
    expect(drawUndeposited(3, [1, 2, 3])).toBeNull();
  });
});

describe('outros', () => {
  it('guardado por mês inclui todos os meses do período', () => {
    const bars = savedByMonth({ inicio: '2027-01-01', fim: '2027-12-31' }, [dep(10, '2027-01-05'), dep(20, '2027-01-20'), dep(30, '2027-03-02')]);
    expect(bars).toHaveLength(12);
    expect(bars[0]).toMatchObject({ key: '2027-01', total: 30, count: 2 });
    expect(bars[2]).toMatchObject({ key: '2027-03', total: 30 });
  });
  it('meta padrão é a que contém hoje', () => {
    const goals = [{ id: 'a', inicio: '2027-01-01', fim: '2027-12-31' }, { id: 'b', inicio: '2028-01-01', fim: '2028-12-31' }];
    expect(defaultGoalId(goals, '2027-06-01')).toBe('a');
    expect(defaultGoalId(goals, '2026-11-15')).toBe('a');
    expect(defaultGoalId(goals, '2029-01-01')).toBe('b');
  });
  it('valida a meta', () => {
    expect(validateGoalDraft({ nome: 'Meta 2027', meta_valor: 40000, inicio: '2027-01-01', fim: '2027-12-31' })).toBeNull();
    expect(validateGoalDraft({ nome: 'X', meta_valor: 100, inicio: '2027-12-31', fim: '2027-01-01' })).toMatch(/fim/);
  });
});
