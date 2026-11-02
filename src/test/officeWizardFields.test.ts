import { describe, it, expect } from 'vitest';
import {
  treinoFields, cardioFields, validateTreinoAnswers, validateCardioAnswers,
} from '@/lib/officeWizard/fields';
import { LEVELS, SPLITS, defaultTreinoWizardState } from '@/lib/officeWizard/treinoWizard';
import { suggestTreinoValues, suggestCardioValues } from '@/lib/officeWizard/officeSummaries';

const required = { nivel: 'intermediario', dias_semana: '5', divisao: 'push_pull_legs', semana_ciclo: '2', equipamento: 'completa' };

describe('perguntas do escritório', () => {
  it('usa as mesmas opções do wizard do admin', () => {
    const f = treinoFields();
    expect(f.find((x) => x.id === 'nivel')!.opcoes!.map((o) => o.valor)).toEqual(LEVELS.map((l) => l.value));
    expect(f.find((x) => x.id === 'divisao')!.opcoes!.map((o) => o.valor)).toEqual(SPLITS.map((s) => s.value));
  });

  it('obrigatórios do treino são os mesmos do botão Gerar', () => {
    expect(treinoFields().filter((f) => f.obrigatorio).map((f) => f.id).sort())
      .toEqual(['dias_semana', 'divisao', 'equipamento', 'nivel', 'semana_ciclo']);
  });

  it('falta campo obrigatório → lista o que falta, sem gerar', () => {
    const r = validateTreinoAnswers({ nivel: 'iniciante' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).faltando.map((x) => x.id).sort()).toEqual(['dias_semana', 'divisao', 'equipamento', 'semana_ciclo']);
  });

  it('valor fora das opções é inválido', () => {
    const r = validateTreinoAnswers({ ...required, nivel: 'pro' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect((r as any).invalidos[0].id).toBe('nivel');
  });

  it('respostas viram o mesmo estado da tela e instruções entram nas observações', () => {
    const r = validateTreinoAnswers({ ...required, dias_semana: 5, possui_lesao: true, local_lesao: ['Joelho'], observacoes: 'x' }, 'foco em glúteo');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state).toEqual({ ...defaultTreinoWizardState(), level: 'intermediario', daysPerWeek: '5', split: 'push_pull_legs', week: '2', equipment: 'completa', hasLesao: true, lesaoLocal: ['Joelho'], notes: 'x\nfoco em glúteo' });
    }
  });

  it('máquinas só valem com equipamento limitado/casa', () => {
    const r = validateTreinoAnswers({ ...required, maquinas: ['halteres'] });
    expect(r.ok && r.state.selectedMachines).toEqual([]);
    const r2 = validateTreinoAnswers({ ...required, equipamento: 'casa', maquinas: ['halteres'] });
    expect(r2.ok && r2.state.selectedMachines).toEqual(['halteres']);
  });

  it('cardio: padrões do wizard e equipamento mapeado', () => {
    const r = validateCardioAnswers({ frequencia_semana: '4', intensidade: 'leve', estilo: 'hiit', duracao: '30', modalidades: ['bike'], eq_bHardLevel: '12' });
    expect(r.ok && r.state).toEqual({ modalities: ['bike'], frequency: '4', intensity: 'leve', style: 'hiit', duration: '30', notes: '', eq: { bHardLevel: '12' } });
  });
});

describe('valor atual sugerido', () => {
  it('treino 5x por semana sugere dias_semana = 5 e próxima semana do ciclo', () => {
    const ex = { exercise: 'Supino', sets: '3', reps: '10' };
    const lastPlan = { created_at: '2026-10-01T00:00:00Z', fase: 'semana_2', mobility_count: 2, conteudo_json: { version: '2', type: 'workout', metadata: {}, days: Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, day: `Dia ${i}`, exercises: [ex] })) } };
    const s = suggestTreinoValues(treinoFields(), { lastPlan, health: { hasDor: true, dorLocal: 'lombar' } });
    expect(s.dias_semana.valor_atual).toBe('5');
    expect(s.semana_ciclo.valor_atual).toBe('3');
    expect(s.mobilidade_qtd.valor_atual).toBe('2');
    expect(s.possui_dor.valor_atual).toBe(true);
    expect(s.local_dor.valor_atual).toBe('lombar');
    expect(s.nivel.valor_atual).toBeNull();
  });

  it('cardio atual 4x na bike sugere frequência e modalidade', () => {
    const p = { title: 'A', modality: 'bike', objective: '', level: 'iniciante', intensity: 'moderada', structure: 'continuo', totalDurationMin: 30, frequencyPerWeek: 4, blocks: [] };
    const s = suggestCardioValues(cardioFields(), { conteudo: JSON.stringify(p) });
    expect(s.frequencia_semana.valor_atual).toBe('4');
    expect(s.modalidades.valor_atual).toEqual(['bike']);
    expect(s.duracao.valor_atual).toBe('auto');
  });
});

