import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlanWhatsAppMessage, chooseMessageIndex, PLAN_WHATSAPP_VARIATION_COUNT } from '@/lib/planWhatsAppMessage';
import { nextPlanWhatsAppMessageIndex } from '@/lib/whatsAppMessageVariation';
import { buildDietWhatsAppMessage, DIET_WHATSAPP_VARIATION_COUNT } from '@/lib/dietWhatsAppMessage';

const base = { firstName: 'Fabiew', titulo: 'Plano Outubro' };
const states = ['new', 'adjusted'] as const;

describe('planWhatsAppMessage', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it.each(states)('todas as variações de %s têm concordância, nome, plano e título', (state) => {
    for (const [noun, gender] of [['treino', 'm'], ['protocolo de cardio', 'm'], ['protocolo de Tabata', 'm'], ['plano', 'm'], ['dieta', 'f']] as const) {
      const messages = Array.from({ length: PLAN_WHATSAPP_VARIATION_COUNT }, (_, seed) =>
        buildPlanWhatsAppMessage({ ...base, noun, gender, state, seed }));
      expect(new Set(messages).size).toBeGreaterThanOrEqual(6);
      for (const message of messages) {
        expect(message).toContain('Fabiew');
        expect(message).toContain(`*${noun}*`);
        expect(message).toContain('"Plano Outubro"');
        expect(message).not.toMatch(/bem-vind|pront[oa] para/i);
        expect(message.match(/\p{Extended_Pictographic}/gu)?.length ?? 0).toBeLessThanOrEqual(1);
        if (gender === 'm') {
          expect(message).not.toMatch(/Sua nova|sua \*|liberada|ajustada|pronta|na seu/i);
        } else {
          expect(message).not.toMatch(/Seu novo|seu \*|liberado|ajustado\b|pronto|no sua/i);
          expect(message).toMatch(/sua|a \*dieta\*/i);
        }
      }
    }
  });

  it('primeira abertura feminina usa Sua nova; ajuste usa na sua', () => {
    expect(buildPlanWhatsAppMessage({ ...base, noun: 'dieta', gender: 'f', state: 'new' })).toContain('Sua nova *dieta*');
    expect(buildPlanWhatsAppMessage({ ...base, noun: 'dieta', gender: 'f', state: 'adjusted' })).toContain('na sua *dieta*');
    expect(buildPlanWhatsAppMessage({ ...base, noun: 'treino', gender: 'm', state: 'adjusted' })).toContain('no seu *treino*');
  });

  it('é puro e determinístico para a mesma seed', () => {
    const input = { ...base, noun: 'treino', gender: 'm', state: 'new', seed: 3 } as const;
    expect(buildPlanWhatsAppMessage(input)).toBe(buildPlanWhatsAppMessage(input));
    expect(localStorage.length).toBe(0);
  });

  it('sorteio nunca seleciona o último índice', () => {
    for (let previous = 0; previous < 6; previous++) {
      const choices = new Set(Array.from({ length: 100 }, (_, i) => chooseMessageIndex(6, previous, i / 100)));
      expect(choices.has(previous)).toBe(false);
      expect(choices.size).toBe(5);
    }
  });

  it('duas chamadas seguidas para o mesmo aluno/tipo não repetem, inclusive trocando estado', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    for (const state of states) {
      let previous = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        const seed = nextPlanWhatsAppMessageIndex('aluno-teste', 'treino', 6);
        const message = buildPlanWhatsAppMessage({ ...base, noun: 'treino', gender: 'm', state, seed });
        expect(message).not.toBe(previous);
        previous = message;
      }
    }
    const key = 'whatsapp:plan-message:aluno-teste:treino';
    const last = Number(localStorage.getItem(key));
    expect(nextPlanWhatsAppMessageIndex('aluno-teste', 'treino', 6)).not.toBe(last);
  });

  it('usa histórico persistido e separa aluno e tipo', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    localStorage.setItem('whatsapp:plan-message:aluno-persistido:cardio', '0');
    expect(nextPlanWhatsAppMessageIndex('aluno-persistido', 'cardio', 6)).toBe(1);
    expect(nextPlanWhatsAppMessageIndex('outro-aluno', 'cardio', 6)).toBe(0);
    expect(nextPlanWhatsAppMessageIndex('aluno-persistido', 'tabata', 6)).toBe(0);
  });

  it('mantém não repetição quando localStorage está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = nextPlanWhatsAppMessageIndex('aluno-sem-storage', 'treino', 6);
    expect(nextPlanWhatsAppMessageIndex('aluno-sem-storage', 'treino', 6)).not.toBe(first);
  });

  it.each(['new', 'adjusted', 'resend'] as const)('dieta %s tem cinco aberturas sem alterar o restante', (resendState) => {
    const plan = { titulo: base.titulo, conteudo_json: { targets: { kcal: 1800, p: 150, c: 150, g: 60 } } };
    const messages = Array.from({ length: DIET_WHATSAPP_VARIATION_COUNT }, (_, seed) =>
      buildDietWhatsAppMessage({ firstName: 'Fabiew', plan, resendState, seed }));
    expect(new Set(messages).size).toBe(5);
    for (const message of messages) {
      expect(message).toContain('Fabiew');
      expect(message).toContain('*Dieta* ("Plano Outubro")');
      expect(message.split('\n\n').slice(2)).toEqual(messages[0].split('\n\n').slice(2));
    }
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const firstSeed = nextPlanWhatsAppMessageIndex(`dieta-${resendState}`, 'dieta', 5);
    const secondSeed = nextPlanWhatsAppMessageIndex(`dieta-${resendState}`, 'dieta', 5);
    expect(buildDietWhatsAppMessage({ firstName: 'Fabiew', plan, resendState, seed: secondSeed }))
      .not.toBe(buildDietWhatsAppMessage({ firstName: 'Fabiew', plan, resendState, seed: firstSeed }));
  });

  it('ciclo de carboidratos fica idêntico em todas as aberturas', () => {
    const plan = { titulo: 'Ciclo', protocols: { carb_cycling: { enabled: true }, weekly_day_targets: { seg: { type: 'high', kcal: 2000, p: 150, c: 200, g: 60 } } } };
    for (const resendState of ['new', 'adjusted', 'resend'] as const) {
      const baseline = buildDietWhatsAppMessage({ firstName: 'Ana', plan, resendState }).split('\n\n').slice(2);
      for (let seed = 1; seed < 5; seed++) {
        expect(buildDietWhatsAppMessage({ firstName: 'Ana', plan, resendState, seed }).split('\n\n').slice(2)).toEqual(baseline);
      }
    }
  });
});