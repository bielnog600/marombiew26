import { describe, expect, it } from 'vitest';
import { normalizeWorkoutPlan, type WorkoutPlan } from '@/lib/workoutSchema';
import { converterPausa, converterReps, converterSelects, preRevisarTreino, renomearDias4x, secaoRevisao, REGRAS_MAROMBIEW_TREINO } from '@/lib/officeWizard/regrasMarombiew';
import { buildTreinoAjusteMessages, buildDietaAjusteMessages } from '@/lib/officeWizard/officeAdjust';

const ex = (id: string, exercise: string, o: Record<string, unknown> = {}) => ({ id, exercise, series: '3', reps: '8-10', restSeconds: 60, variation: exercise, ...o });
const plan = (days: Array<{ id: string; day: string; exercises: unknown[] }>): WorkoutPlan =>
  normalizeWorkoutPlan({ version: '2.0', type: 'workout', metadata: {}, days })!;

describe('conversão dos selects pela tabela do Fabiew', () => {
  it('reps', () => {
    expect(converterReps('5-8')).toBe('6-8');
    expect(converterReps('6-10')).toBe('8-10');
    expect(converterReps('9-12')).toBe('8-12');
    expect(converterReps('10-15')).toBe('12-15');
    expect(converterReps('15-18')).toBe('12-15');
    expect(converterReps('20-40s')).toBe('30s');
    expect(converterReps('8-10')).toBeNull();
  });
  it('pausas: 75s → 90s (acessório 60s), 105s → 90s, 150s → 120s', () => {
    expect(converterPausa(75, 'Supino reto')).toBe(90);
    expect(converterPausa(75, 'Rosca direta')).toBe(60);
    expect(converterPausa(105, 'Agachamento livre')).toBe(90);
    expect(converterPausa(150, 'Agachamento livre')).toBe(120);
    expect(converterPausa(90, 'Supino reto')).toBeNull();
  });
  it('converte no plano, incluindo reconhecimento + trabalho', () => {
    const p = plan([{ id: 'd', day: 'Segunda', exercises: [ex('1', 'Supino reto', { series: '1', series2: '2', reps: '12 + 9-12', restSeconds: 105 })] }]);
    const r = converterSelects(p);
    expect(r.plan.days[0].exercises[0].reps).toBe('12 + 8-12');
    expect(r.plan.days[0].exercises[0].restSeconds).toBe(90);
    expect(r.correcoes).toHaveLength(2);
    expect(p.days[0].exercises[0].reps).toBe('12 + 9-12');
  });
});

describe('treino 4x seg–qui', () => {
  const p = plan(['Segunda', 'Terça', 'Quarta', 'Quinta'].map((d, i) => ({ id: `d${i}`, day: d, exercises: [] })));
  it('vira Segunda, Terça, Quinta, Sexta', () => {
    expect(renomearDias4x(p).plan.days.map((d) => d.day)).toEqual(['Segunda', 'Terça', 'Quinta', 'Sexta']);
  });
  it('não mexe em outros dias', () => {
    const q = plan(['Segunda', 'Terça', 'Quinta', 'Sexta'].map((d, i) => ({ id: `d${i}`, day: d, exercises: [] })));
    expect(renomearDias4x(q).correcoes).toEqual([]);
    expect(preRevisarTreino(q).plan.days.map((d) => d.day)).toEqual(['Segunda', 'Terça', 'Quinta', 'Sexta']);
  });
});

describe('prompt do ajustar', () => {
  const p = plan([{ id: 'd', day: 'Segunda', exercises: [ex('1', 'Supino reto')] }]);
  const base = { plan: p, pedido: 'x', catalogBlock: '', metodos: [] };
  it('revisar e demais categorias levam as regras literais; revisar pede todas', () => {
    const r = buildTreinoAjusteMessages({ ...base, categoria: 'revisar', semana: 1 });
    const o = buildTreinoAjusteMessages({ ...base, categoria: 'exercicios' });
    expect(r.system).toContain(REGRAS_MAROMBIEW_TREINO);
    expect(o.system).toContain(REGRAS_MAROMBIEW_TREINO);
    expect(r.system).toContain('TODAS as regras');
    expect(o.system).toContain('regras de fundo');
    expect(r.user).toContain('semana 1');
  });
  it('dieta: manteiga e porções reais nas regras', () => {
    const d = buildDietaAjusteMessages({ plan: {}, categoria: 'revisar', pedido: 'x', foodCatalogBlock: '' });
    expect(d.system).toContain('Manteiga não entra');
    expect(d.system).toContain('ovo = 50 g/unidade');
  });
});

describe('resumo do revisar', () => {
  it('tabelas antes → depois e lista do corrigido', () => {
    const antes = plan([{ id: 'd', day: 'Segunda', exercises: [ex('1', 'Rosca direta', { series: '2' })] }]);
    const depois = plan([{ id: 'd', day: 'Segunda', exercises: [ex('1', 'Rosca direta', { series: '3' })] }]);
    const s = secaoRevisao(antes, depois, ['Rosca direta 2 → 3 séries'], { semana: 1 });
    expect(s).toContain('| Segunda | 2 | 3 |');
    expect(s).toContain('| Bíceps | 8–12 | 2 | 3 | ⚠ abaixo |');
    expect(s).toContain('- Rosca direta 2 → 3 séries');
  });
});
