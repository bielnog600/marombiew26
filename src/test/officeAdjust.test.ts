import { describe, expect, it, vi } from 'vitest';
import { normalizeWorkoutPlan, type WorkoutPlan } from '@/lib/workoutSchema';
import { analisarTreino, grupoPrincipal, seriesDeTrabalho } from '@/lib/officeWizard/treinoAnalysis';
import { categoriaValida, dietaItensProibidos, mudancasTreino, validateTreinoAjuste, parseAjusteResposta } from '@/lib/officeWizard/officeAdjust';
import { buildWorkoutPlanUpdatePayload } from '@/lib/workoutPlanInsert';

const captured: { updates?: Record<string, unknown> } = {};
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (u: Record<string, unknown>) => { captured.updates = u; return { eq: async () => ({ error: null }) }; },
    }),
  },
}));

const ex = (id: string, exercise: string, o: Record<string, unknown> = {}) => ({ id, exercise, series: '3', reps: '8-10', restSeconds: 60, variation: 'Supino inclinado', ...o });
const plan = (days: Array<{ id: string; day: string; focus?: string; exercises: unknown[] }>): WorkoutPlan =>
  normalizeWorkoutPlan({ version: '2.0', type: 'workout', metadata: {}, days })!;

describe('analisar treino', () => {
  it('conta só séries de trabalho (reconhecimento e mobilidade fora)', () => {
    const p = plan([{ id: 'd1', day: 'A', exercises: [
      ex('1', 'Mobilidade de quadril', { series: '2', reps: '10' }),
      ex('2', 'Supino reto', { series: '1', series2: '2', reps: '12 + 8-10' }),
      ex('3', 'Rosca direta', { series: '3', variation: 'Rosca alternada' }),
    ] }]);
    expect(seriesDeTrabalho(p.days[0].exercises[0])).toBe(0);
    expect(seriesDeTrabalho(p.days[0].exercises[1])).toBe(2);
    expect(analisarTreino(p).porDia[0].series).toBe(5);
  });

  it('grupo principal pelas regras do Fabiew', () => {
    expect(grupoPrincipal('Afundo')).toBe('quadriceps');
    expect(grupoPrincipal('Leg press 45')).toBe('quadriceps');
    expect(grupoPrincipal('Elevação pélvica')).toBe('gluteo');
    expect(grupoPrincipal('Kick back')).toBe('gluteo');
    expect(grupoPrincipal('Cadeira abdutora')).toBe('gluteo');
    expect(grupoPrincipal('Stiff')).toBe('posterior');
    expect(grupoPrincipal('Good morning')).toBe('posterior');
    expect(grupoPrincipal('Mesa flexora')).toBe('posterior');
  });

  it('alerta acima de 18 séries no dia na semana 1 e não na semana 2', () => {
    const exs = Array.from({ length: 7 }, (_, i) => ex(String(i), 'Supino reto', { variation: 'Crucifixo' }));
    const p = plan([{ id: 'd', day: 'A', exercises: exs }]);
    expect(analisarTreino(p, { semana: 1 }).porDia[0].acimaLimite).toBe(true);
    expect(analisarTreino(p, { semana: 2 }).porDia[0].acimaLimite).toBe(false);
  });

  it('alvos semanais: pequenos 8–12, grandes 12–20', () => {
    const p = plan([{ id: 'd', day: 'A', exercises: [ex('1', 'Rosca direta', { series: '3', variation: 'Rosca martelo' })] }]);
    const g = analisarTreino(p).porGrupo;
    expect(g.find((x) => x.grupo === 'biceps')).toMatchObject({ series: 3, alvo: { min: 8, max: 12 }, status: 'abaixo' });
    expect(g.find((x) => x.grupo === 'costas')?.alvo).toEqual({ min: 12, max: 20 });
  });

  it('aponta reps/pausa fora do editor, variação vazia, variação repetindo principal de outro dia, inferiores sem elevação pélvica e costas sem puxada vertical', () => {
    const p = plan([
      { id: 'd1', day: 'A', exercises: [ex('1', 'Agachamento livre', { reps: '9', variation: 'Kick back' }), ex('2', 'Kick back', { variation: 'Kick back' }), ex('3', 'Stiff', { variation: '', restSeconds: 75 })] },
      { id: 'd2', day: 'B', exercises: [ex('4', 'Remada curvada', { variation: 'Remada baixa' }), ex('5', 'Remada baixa', { variation: 'Remada curvada' })] },
    ]);
    const t = analisarTreino(p).avisos.join('\n');
    expect(t).toContain('reps "9" fora do editor');
    expect(t).toContain('pausa "75s" fora do editor');
    expect(t).toContain('Stiff: variação vazia');
    expect(t).toContain('sem composto de glúteo');
    expect(t).toContain('sem puxada vertical composta');
  });
});

describe('validar ajuste de treino', () => {
  const before = plan([{ id: 'd1', day: 'A', exercises: [ex('1', 'Supino reto', { variation: 'Supino inclinado' }), ex('2', 'Rosca direta', { variation: 'Rosca martelo' })] }]);
  const catalog = ['Supino reto', 'Supino inclinado', 'Supino vertical', 'Rosca direta', 'Rosca martelo'];

  it('aceita troca por exercício do banco e só lista o que mudou', () => {
    const raw = JSON.parse(JSON.stringify(before));
    raw.days[0].exercises[0].exercise = 'Supino vertical';
    const v = validateTreinoAjuste(before, raw, catalog, [], 'exercicios');
    expect(v.erros).toEqual([]);
    expect(mudancasTreino(before, v.plan!)).toEqual(['A · Supino reto: exercício Supino reto → Supino vertical']);
  });

  it('rejeita fora do banco, reps/pausa fora dos selects e bíceps com menos de 3 séries', () => {
    const raw = JSON.parse(JSON.stringify(before));
    raw.days[0].exercises[0].exercise = 'Supino maluco';
    raw.days[0].exercises[1] = { ...raw.days[0].exercises[1], series: '2', reps: '11', restSeconds: 180 };
    const e = validateTreinoAjuste(before, raw, catalog, [], 'livre').erros.join('\n');
    expect(e).toContain('fora do banco');
    expect(e).toContain('reps "11" fora do editor');
    expect(e).toContain('pausa "180s" fora do editor');
    expect(e).toContain('mínimo 3 séries');
  });

  it('rejeita Isometria parede e Elevação pélvica unilateral (a "1")', () => {
    const raw = JSON.parse(JSON.stringify(before));
    raw.days[0].exercises[0].exercise = 'Elevação pélvica unilateral';
    const e = validateTreinoAjuste(before, raw, [...catalog, 'Elevação pélvica unilateral'], [], 'livre').erros.join('\n');
    expect(e).toContain('proibido');
  });

  it('categorias válidas por tipo', () => {
    expect(categoriaValida('treino', 'metodos')).toBe(true);
    expect(categoriaValida('dieta', 'metodos')).toBe(false);
    expect(categoriaValida('cardio', 'intensidade')).toBe(true);
  });

  it('lê { plan, mudancas } da resposta da IA', () => {
    expect(parseAjusteResposta('{"plan":{"a":1},"mudancas":["x → y"]}')).toEqual({ plan: { a: 1 }, mudancas: ['x → y'] });
  });
});

describe('dieta: regras', () => {
  it('manteiga não entra (pasta de amendoim pode)', () => {
    const p = { days: [{ label: 'Padrão', meals: [{ name: 'Café', items: [{ name: 'Manteiga' }, { name: 'Pasta de amendoim (manteiga de amendoim)' }] }] }] };
    expect(dietaItensProibidos(p)).toHaveLength(1);
  });
});

describe('equivalência: publicar ajuste grava igual ao botão Salvar do editor', () => {
  it('saveWorkoutPlanJSON envia exatamente o UPDATE de buildWorkoutPlanUpdatePayload', async () => {
    const { saveWorkoutPlanJSON } = await import('@/lib/workoutPlanRepo');
    const p = plan([{ id: 'd1', day: 'A', exercises: [
      ex('1', 'Cadeira extensora', { method: { slug: 'drop_set' }, metodo: 'dropset', metodo_params: { aplicar: 'ultima', drops: 2, reducao_pct: 20 } }),
      ex('2', 'Supino reto', { grupo_id: 'g1', tipo_grupo: 'biset', ordem_grupo: 'A', pausa_grupo_s: 0 }),
      ex('3', 'Crucifixo', { grupo_id: 'g1', tipo_grupo: 'biset', ordem_grupo: 'B', pausa_grupo_s: 0 }),
      ex('4', 'Rosca direta', { setScheme: { mode: 'per_set', sets: [{ set_number: 1, set_type: 'work', target_reps: '12' }, { set_number: 2, set_type: 'work', target_reps: '10' }, { set_number: 3, set_type: 'work', target_reps: '8' }] }, method: { slug: 'pyramid_up' } }),
    ] }]);
    const r = await saveWorkoutPlanJSON('plan-1', p, {});
    expect(r.success).toBe(true);
    const built = buildWorkoutPlanUpdatePayload(p, {});
    expect(built.success).toBe(true);
    expect(captured.updates).toEqual((built as { updates: unknown }).updates);
    const json = (built as { json: WorkoutPlan }).json;
    expect(json.days[0].exercises[3].setScheme?.mode).toBe('per_set');
    expect(json.days[0].exercises[1].grupo_id).toBe('g1');
  });
});

describe('resumo_legivel em markdown', () => {
  it('treino vira tabela com dia, exercício, séries, reps, RIR, pausa, método, variação e descrição', async () => {
    const { resumoTreinoCompleto } = await import('@/lib/officeWizard/officeSummaries');
    const md = resumoTreinoCompleto(plan([{ id: 'd1', day: 'Treino A', focus: 'Peito', exercises: [
      ex('1', 'Supino reto', { series: '1', series2: '2', reps: '12 + 8-10', rir: '1', description: 'Excêntrica 3s | pico' }),
    ] }]));
    expect(md).toContain('| Dia | Exercício | Séries | Reps | RIR | Pausa | Método | Variação | Descrição |');
    expect(md).toContain('| Treino A | Supino reto | 1 rec. + 2 | 12 + 8-10 | 1 | 60s | — | Supino inclinado | Excêntrica 3s / pico |');
  });
});
