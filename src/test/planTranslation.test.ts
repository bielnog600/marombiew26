import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import {
  TRANSLATION_RETRY_AFTER_MS,
  TRANSLATION_TIMEOUT_MS,
  __resetPlanTranslationState,
  getCachedPlanTranslation,
  translatePlanTexts,
} from '@/lib/planTranslation';
import { dictionaryFromPairs, translateDisplayText } from '@/lib/planTranslationDisplay';

const PLAN = '11111111-1111-4111-8111-111111111111';
const PT = '| Refeição | Horário | Alimento | Quantidade |\n|---|---|---|---|\n| Almoço | 12:00 | Arroz branco | 150 g |';
const PAIRS = [['Almoço', 'Lunch'], ['Arroz branco', 'White rice']];

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  __resetPlanTranslationState();
});
afterEach(() => vi.useRealTimers());

describe('translatePlanTexts — segundo plano, nunca trava', () => {
  it('espera até 120 s e, em timeout, não bloqueia novas tentativas', async () => {
    expect(TRANSLATION_TIMEOUT_MS).toBe(120_000);
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const pending = translatePlanTexts(PLAN, PT, 'en');
    let settled = false;
    pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeNull();

    // Timeout não ativa a pausa de 10 min: a próxima abertura pergunta de novo
    // (o servidor terminou e guardou a tradução).
    invoke.mockResolvedValue({ data: { pairs: PAIRS, cached: true }, error: null });
    const dict = await translatePlanTexts(PLAN, PT, 'en');
    expect(translateDisplayText(dict, 'Almoço')).toBe('Lunch');
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('cancela a chamada no timeout (AbortSignal) e manda só o id do plano', async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const pending = translatePlanTexts(PLAN, PT, 'en');
    await vi.advanceTimersByTimeAsync(0);
    const [, options] = invoke.mock.calls[0];
    expect(options.body).toEqual({ planId: PLAN, targetLanguage: 'en' });
    expect((options.signal as AbortSignal).aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT_MS);
    await pending;
    expect((options.signal as AbortSignal).aborted).toBe(true);
  });

  it('ERRO do servidor devolve null e pausa 10 min; depois tenta de novo', async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValueOnce({ data: null, error: new Error('502') });
    await expect(translatePlanTexts(PLAN, PT, 'en')).resolves.toBeNull();
    await expect(translatePlanTexts(PLAN, PT, 'en')).resolves.toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(TRANSLATION_RETRY_AFTER_MS).toBe(600_000);

    await vi.advanceTimersByTimeAsync(TRANSLATION_RETRY_AFTER_MS);
    invoke.mockResolvedValue({ data: { pairs: PAIRS }, error: null });
    expect(await translatePlanTexts(PLAN, PT, 'en')).not.toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('exceção de rede também devolve null sem quebrar', async () => {
    invoke.mockRejectedValueOnce(new Error('rede'));
    await expect(translatePlanTexts(PLAN, PT, 'en')).resolves.toBeNull();
  });

  it('localStorage indisponível não quebra a tradução', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    invoke.mockResolvedValue({ data: { pairs: PAIRS }, error: null });
    const dict = await translatePlanTexts(PLAN, PT, 'en');
    expect(translateDisplayText(dict, 'Arroz branco')).toBe('White rice');
    spy.mockRestore();
  });

  it('sucesso fica neste aparelho e chamadas simultâneas usam uma só chamada', async () => {
    let resolve!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => { resolve = r; }));
    const a = translatePlanTexts(PLAN, PT, 'en');
    const b = translatePlanTexts(PLAN, PT, 'en');
    await Promise.resolve();
    resolve({ data: { pairs: PAIRS }, error: null });
    await a; await b;
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(translateDisplayText(getCachedPlanTranslation(PLAN, PT, 'en'), 'Almoço')).toBe('Lunch');
    // conteúdo editado = outra chave
    expect(getCachedPlanTranslation(PLAN, `${PT}\n`, 'en')).toBeNull();
  });

  it('resposta sem pares válidos é tratada como erro', async () => {
    invoke.mockResolvedValue({ data: { translated: 'markdown antigo' }, error: null });
    await expect(translatePlanTexts(PLAN, PT, 'en')).resolves.toBeNull();
  });

  it('português ou plano sem id nunca chama o servidor', async () => {
    await expect(translatePlanTexts(PLAN, PT, 'pt')).resolves.toBeNull();
    await expect(translatePlanTexts(null, PT, 'en')).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('planTranslationDisplay — tradução só para exibir', () => {
  it('troca só textos com par; o resto fica em português', () => {
    const dict = dictionaryFromPairs([['Almoço', 'Lunch'], ['Arroz branco', 'White rice']]);
    expect(translateDisplayText(dict, 'Almoço')).toBe('Lunch');
    expect(translateDisplayText(dict, '**Arroz  branco**')).toBe('White rice');
    expect(translateDisplayText(dict, 'Feijão')).toBe('Feijão');
    expect(translateDisplayText(null, 'Almoço')).toBe('Almoço');
    expect(dictionaryFromPairs([])).toBeNull();
  });

  it('mantém maiúsculas dos rótulos do treino', () => {
    const dict = dictionaryFromPairs([['SEGUNDA-FEIRA', 'Monday']]);
    expect(translateDisplayText(dict, 'SEGUNDA-FEIRA')).toBe('MONDAY');
  });
});
