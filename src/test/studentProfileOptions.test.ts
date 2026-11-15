import { describe, expect, it } from 'vitest';
import { joinObjetivo, normalizeObjetivo, parseObjetivo, RACA_OPTIONS } from '../../supabase/functions/_shared/studentProfileOptions';
import { validatePerfil } from '../../supabase/functions/_shared/questionnaireProfile';

describe('pré-preenchimento do objetivo a partir do texto do perfil', () => {
  it('ignora maiúsculas e espaços', () => {
    expect(parseObjetivo('Hipertrofia ')).toEqual({ selected: ['Hipertrofia'], outro: '' });
    expect(parseObjetivo('  emagrecimento')).toEqual({ selected: ['Emagrecimento'], outro: '' });
  });
  it('sinónimos: emagrecer/perder peso/perder gordura → Emagrecimento', () => {
    expect(parseObjetivo('Emagrecer ').selected).toEqual(['Emagrecimento']);
    expect(parseObjetivo('Perder peso').selected).toEqual(['Emagrecimento']);
    expect(parseObjetivo('perder gordura').selected).toEqual(['Emagrecimento']);
  });
  it('definir → Definição; saúde → Saúde e qualidade de vida', () => {
    expect(parseObjetivo('Definir e hipertrofia')).toEqual({ selected: ['Hipertrofia', 'Definição'], outro: '' });
    expect(parseObjetivo('Hipertrofia, mais saúde')).toEqual({ selected: ['Hipertrofia', 'Saúde e qualidade de vida'], outro: '' });
  });
  it('o resto vai para "Outro objetivo"', () => {
    expect(parseObjetivo('Emagrecer e ganha massa magra')).toEqual({ selected: ['Emagrecimento'], outro: 'ganha massa magra' });
    expect(parseObjetivo('Ter mais saúde, hipertrofia e chegar aos 70kg'))
      .toEqual({ selected: ['Hipertrofia', 'Saúde e qualidade de vida'], outro: 'chegar aos 70kg' });
    expect(parseObjetivo('Quer trabalhar mais quadríceps')).toEqual({ selected: [], outro: 'Quer trabalhar mais quadríceps' });
  });
  it('lê de volta o texto salvo, incluindo "Outro:"', () => {
    expect(parseObjetivo('Hipertrofia, Emagrecimento, Outro: chegar aos 70 kg'))
      .toEqual({ selected: ['Hipertrofia', 'Emagrecimento'], outro: 'chegar aos 70 kg' });
    expect(parseObjetivo('Voltar a treinar / reabilitação').selected).toEqual(['Voltar a treinar / reabilitação']);
  });
});

describe('texto salvo em students_profile.objetivo', () => {
  it('chips unidos por ", " e Outro no fim', () => {
    expect(joinObjetivo(['Emagrecimento', 'Hipertrofia'], ' chegar aos 70 kg ')).toBe('Hipertrofia, Emagrecimento, Outro: chegar aos 70 kg');
  });
  it('sem nada → vazio (não apaga o perfil)', () => {
    expect(joinObjetivo([], '  ')).toBe('');
    expect(validatePerfil({ objetivo: '' }, { today: '2026-11-15', pesoObrigatorio: false })).toEqual({ ok: true, value: {} });
  });
  it('o servidor grava o texto unido', () => {
    expect(validatePerfil({ objetivo: 'Emagrecer e ganha massa magra' }, { today: '2026-11-15', pesoObrigatorio: false }))
      .toEqual({ ok: true, value: { objetivo: 'Emagrecimento, Outro: ganha massa magra' } });
  });
  it('salvar de novo não muda o texto', () => {
    const t = 'Hipertrofia, Recomposição corporal, Outro: chegar aos 70 kg';
    expect(normalizeObjetivo(t)).toBe(t);
  });
});

describe('raça', () => {
  it('Branco · Pardo · Negro com os valores atuais', () => {
    expect(RACA_OPTIONS).toEqual([
      { value: 'branco', label: 'Branco' }, { value: 'pardo', label: 'Pardo' }, { value: 'negro', label: 'Negro' },
    ]);
  });
});
