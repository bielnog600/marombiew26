import { describe, expect, it } from 'vitest';
import {
  buildProfileUpdate, fichaUpdatedFields, needsWeight, pickQuestionnaireAnswers, resolveToday,
  splitPhone, joinPhone, validatePerfil,
} from '../../supabase/functions/_shared/questionnaireProfile';

const today = '2026-11-15';

describe('peso só é pedido sem pesagem nos últimos 15 dias (hoje conta)', () => {
  it('sem registro → pede', () => expect(needsWeight(null, today)).toBe(true));
  it('registro de hoje → não pede', () => expect(needsWeight('2026-11-15', today)).toBe(false));
  it('registro há 14 dias (1º dia da janela) → não pede', () => expect(needsWeight('2026-11-01', today)).toBe(false));
  it('registro há 15 dias → pede', () => expect(needsWeight('2026-10-31', today)).toBe(true));
});

describe('validação no servidor', () => {
  const v = (perfil: Record<string, unknown>, peso = false) => validatePerfil(perfil, { today, pesoObrigatorio: peso });
  it('altura 100–250 cm', () => {
    expect(v({ altura: '99' })).toEqual({ ok: false, error: 'A altura tem de estar entre 100 e 250 cm.' });
    expect(v({ altura: '251' }).ok).toBe(false);
    expect(v({ altura: '172,5' })).toEqual({ ok: true, value: { altura: 172.5 } });
  });
  it('peso 30–300 kg e obrigatório quando aparece', () => {
    expect(v({}, true)).toEqual({ ok: false, error: 'Informe o seu peso corporal (kg).' });
    expect(v({ peso: '29' }, true)).toEqual({ ok: false, error: 'O peso tem de estar entre 30 e 300 kg.' });
    expect(v({ peso: '301' }, true).ok).toBe(false);
    expect(v({ peso: '78,4' }, true)).toEqual({ ok: true, value: { peso: 78.4 } });
  });
  it('peso enviado sem ser pedido é ignorado', () => expect(v({ peso: '80' }, false)).toEqual({ ok: true, value: {} }));
  it('nascimento entre 1930 e hoje − 10 anos', () => {
    expect(v({ data_nascimento: '1929-12-31' }).ok).toBe(false);
    expect(v({ data_nascimento: '2016-11-16' }).ok).toBe(false);
    expect(v({ data_nascimento: '2016-11-15' }).ok).toBe(true);
    expect(v({ data_nascimento: '1930-01-01' }).ok).toBe(true);
  });
  it('telefone só dígitos, + e espaços', () => {
    expect(v({ telefone: '+351 93-934' })).toEqual({ ok: false, error: 'O telefone só pode ter números, espaços e o sinal +.' });
    expect(v({ telefone: '+351 939 345 414' })).toEqual({ ok: true, value: { telefone: '+351 939 345 414' } });
  });
  it('raça tem de ser uma das opções do admin', () => {
    expect(v({ raca: 'outra' }).ok).toBe(false);
    expect(v({ raca: 'pardo' })).toEqual({ ok: true, value: { raca: 'pardo' } });
  });
});

describe('envio atualiza o perfil', () => {
  const base = { current: { observacoes: null, telefone: '351911111111' }, today };

  it('nascimento, altura, raça, objetivo, telefone e peso', () => {
    const plan = buildProfileUpdate({
      ...base,
      perfil: { data_nascimento: '1990-05-20', altura: 172, raca: 'branco', objetivo: 'Hipertrofia', telefone: '+55 11 912345678', peso: 80.2 },
      answers: {},
    });
    expect(plan.studentsProfile).toEqual({ data_nascimento: '1990-05-20', altura: 172, raca: 'branco', objetivo: 'Hipertrofia' });
    expect(plan.telefone).toBe('+55 11 912345678');
    expect(plan.weightLog).toEqual({ peso: 80.2, data: '2026-11-15' });
  });

  it('campos vazios não apagam nada', () => {
    const plan = buildProfileUpdate({ ...base, perfil: {}, answers: { restricoes_alimentares: '', dores_articulares: [], observacoes: '  ' } });
    expect(plan.studentsProfile).toEqual({});
    expect(plan.telefone).toBeNull();
    expect(plan.weightLog).toBeNull();
  });

  it('mesmo telefone com outro formato não regrava', () => {
    const plan = buildProfileUpdate({ ...base, perfil: { telefone: '+351 911 111 111' }, answers: {} });
    expect(plan.telefone).toBeNull();
  });

  it('restrições = mesmo texto de restricoes_alimentares', () => {
    const plan = buildProfileUpdate({ ...base, perfil: {}, answers: { restricoes_alimentares: 'Sem lactose, Sem ovo, Alergia a kiwi' } });
    expect(plan.studentsProfile.restricoes).toBe('Sem lactose, Sem ovo, Alergia a kiwi');
  });

  it('lesões = dores marcadas + observações; "Não sinto dores" não apaga', () => {
    expect(buildProfileUpdate({ ...base, perfil: {}, answers: { dores_articulares: ['Ombro direito', 'Coluna lombar'], dores_observacoes: 'Dói no supino' } })
      .studentsProfile.lesoes).toBe('Ombro direito, Coluna lombar. Dói no supino');
    expect(buildProfileUpdate({ ...base, perfil: {}, answers: { dores_articulares: ['Não sinto dores'] } }).studentsProfile.lesoes).toBeUndefined();
  });

  it('observações acrescentadas com a data, sem duplicar', () => {
    const first = buildProfileUpdate({ ...base, current: { observacoes: 'Treina de manhã' }, perfil: {}, answers: { observacoes: 'Trabalho por turnos' } });
    expect(first.studentsProfile.observacoes).toBe('Treina de manhã\n[ficha 15/11/2026] Trabalho por turnos');
    const again = buildProfileUpdate({ ...base, current: { observacoes: first.studentsProfile.observacoes as string }, perfil: {}, answers: { observacoes: 'Trabalho por turnos' } });
    expect(again.studentsProfile.observacoes).toBeUndefined();
  });
});

describe('ficha nunca grava colunas de controle', () => {
  it('ignora student_id/status/token', () => {
    expect(pickQuestionnaireAnswers({ student_id: 'x', status: 'pending', token: 't', fase_atual: 'Cutting' })).toEqual({ fase_atual: 'Cutting' });
  });
});

describe('telefone e data', () => {
  it('separa DDI de Portugal e Brasil', () => {
    expect(splitPhone('351939345414')).toEqual({ ddi: '351', numero: '939345414' });
    expect(splitPhone('+55 11 91234-5678')).toEqual({ ddi: '55', numero: '11912345678' });
    expect(joinPhone('351', '939345414')).toBe('+351 939345414');
  });
  it('data do aluno aceita só ±1 dia do servidor', () => {
    const now = new Date('2026-11-15T22:00:00Z');
    expect(resolveToday('2026-11-16', now)).toBe('2026-11-16');
    expect(resolveToday('2026-12-01', now)).toBe('2026-11-15');
  });
});

describe('selo "Atualizado pela ficha" no admin', () => {
  it('só nos campos que ainda têm o valor da ficha', () => {
    const fields = fichaUpdatedFields(
      { aplicados: { altura: 172, objetivo: 'Hipertrofia', telefone: '+351 939345414', peso: 80 } },
      { altura: '172.0', objetivo: 'Emagrecimento', telefone: '351939345414' },
    );
    expect([...fields].sort()).toEqual(['altura', 'telefone']);
  });
});
