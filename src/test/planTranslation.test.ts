import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import {
  TRANSLATION_RETRY_AFTER_MS,
  TRANSLATION_TIMEOUT_MS,
  __resetPlanTranslationState,
  getCachedPlanTranslation,
  translatePlanMarkdown,
} from '@/lib/planTranslation';
import { buildPlanTextDictionary, translateDisplayText } from '@/lib/planTranslationDisplay';

const PT = '| Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G |\n|---|---|---|---|---|---|---|---|\n| Almoço | 12:00 | Arroz branco | 150 g | 190 | 4 | 42 | 0 |';
const EN = '| Meal | Time | Food | Amount | Kcal | P | C | G |\n|---|---|---|---|---|---|---|---|\n| Lunch | 12:00 | White rice | 150 g | 190 | 4 | 42 | 0 |';

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  __resetPlanTranslationState();
});
afterEach(() => vi.useRealTimers());

describe('translatePlanMarkdown — nunca trava', () => {
  it('em 15 s sem resposta devolve o original e não tenta de novo por 10 min', async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const pending = translatePlanMarkdown(PT, 'en');
    await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT_MS - 1);
    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe(PT);
    expect(TRANSLATION_TIMEOUT_MS).toBe(15_000);

    // Dentro de 10 min: devolve o original na hora, sem chamar a IA.
    await vi.advanceTimersByTimeAsync(TRANSLATION_RETRY_AFTER_MS - 60_000);
    await expect(translatePlanMarkdown(PT, 'en')).resolves.toBe(PT);
    expect(invoke).toHaveBeenCalledTimes(1);

    // Passados 10 min, tenta de novo.
    await vi.advanceTimersByTimeAsync(60_000);
    invoke.mockResolvedValue({ data: { translated: EN }, error: null });
    await expect(translatePlanMarkdown(PT, 'en')).resolves.toBe(EN);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(TRANSLATION_RETRY_AFTER_MS).toBe(600_000);
  });

  it('cancela a chamada no timeout (AbortSignal)', async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const pending = translatePlanMarkdown(PT, 'en');
    await vi.advanceTimersByTimeAsync(0);
    const signal = invoke.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT_MS);
    await pending;
    expect(signal.aborted).toBe(true);
  });

  it('erro da função ou exceção devolve o original e marca a pausa de 10 min', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error('502') });
    await expect(translatePlanMarkdown(PT, 'en')).resolves.toBe(PT);
    await expect(translatePlanMarkdown(PT, 'en')).resolves.toBe(PT);
    expect(invoke).toHaveBeenCalledTimes(1);

    invoke.mockRejectedValueOnce(new Error('rede'));
    await expect(translatePlanMarkdown(`${PT}\n`, 'en')).resolves.toBe(`${PT}\n`);
  });

  it('localStorage indisponível não quebra a tradução', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    invoke.mockResolvedValue({ data: { translated: EN }, error: null });
    await expect(translatePlanMarkdown(PT, 'en')).resolves.toBe(EN);
    spy.mockRestore();
  });

  it('sucesso fica em cache e chamadas simultâneas usam uma só IA', async () => {
    let resolve!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((r) => { resolve = r; }));
    const a = translatePlanMarkdown(PT, 'en');
    const b = translatePlanMarkdown(PT, 'en');
    await Promise.resolve();
    resolve({ data: { translated: EN }, error: null });
    await expect(a).resolves.toBe(EN);
    await expect(b).resolves.toBe(EN);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(getCachedPlanTranslation(PT, 'en')).toBe(EN);
  });

  it('português nunca chama a IA', async () => {
    await expect(translatePlanMarkdown(PT, 'pt')).resolves.toBe(PT);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('planTranslationDisplay — tradução só para exibir', () => {
  it('pareia célula a célula quando a estrutura é a mesma', () => {
    const dict = buildPlanTextDictionary(PT, EN);
    expect(translateDisplayText(dict, 'Almoço')).toBe('Lunch');
    expect(translateDisplayText(dict, 'Arroz branco')).toBe('White rice');
    expect(translateDisplayText(dict, 'Feijão')).toBe('Feijão');
  });

  it('tradução com linhas a mais ou colunas diferentes é ignorada (mostra o original)', () => {
    const extraRow = `${EN}\n| Dinner | 19:00 | Eggs | 2 un | 140 | 12 | 1 | 10 |`;
    expect(buildPlanTextDictionary(PT, extraRow)).toBeNull();
    const fewerCols = EN.replace('| 0 |', '|');
    expect(buildPlanTextDictionary(PT, fewerCols)).toBeNull();
    expect(translateDisplayText(null, 'Almoço')).toBe('Almoço');
  });

  it('mantém maiúsculas dos rótulos do treino', () => {
    const md = '| TREINO DO DIA | EXERCÍCIO |\n|---|---|\n| SEGUNDA-FEIRA | LEG 180 |';
    const en = '| WORKOUT DAY | EXERCISE |\n|---|---|\n| Monday | LEG 180 |';
    expect(translateDisplayText(buildPlanTextDictionary(md, en), 'SEGUNDA-FEIRA')).toBe('MONDAY');
  });
});
