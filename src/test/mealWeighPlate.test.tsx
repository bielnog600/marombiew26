import React from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPlateTotal, buildEstimatedItems, distributeToTotal, normalizePlateEstimate, plateFoodTotal, plateNeedsTareQuestion,
  formatPlateRange, resolvePlateRows,
} from '@/lib/mealWeigh/plateEstimate';
import { dayMealFoodsFromLog, formatDayWeighLabel, plannedFromMeal } from '@/lib/mealWeigh';

/** "Prato pronto": uma foto, a IA identifica cada alimento e estima as gramas (IA sempre simulada). */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = [
  { id: 'f-arroz', name: 'Arroz branco cozido', calories: 130, protein: 2.5, carbs: 28, fats: 0.2, portion_size: 100 },
  { id: 'f-frango', name: 'Peito de frango grelhado', calories: 160, protein: 32, carbs: 0, fats: 3, portion_size: 100 },
  { id: 'f-broc', name: 'Brócolis cozido', calories: 35, protein: 2.4, carbs: 7, fats: 0.4, portion_size: 100 },
  { id: 'f-feijao', name: 'Feijão carioca cozido', calories: 76, protein: 4.8, carbs: 13.6, fats: 0.5, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : { insert: (row: any) => { mock.insert(row); return { select: () => ({ single: async () => ({ data: { id: 'log-new', created_at: 'now', ...row }, error: null }) }) }; } },
    functions: { invoke: mock.invoke },
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';

const meal = {
  name: 'Almoço', time: '12:30',
  foods: [
    { food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '3.8', c: '42', g: '0.3' },
    { food: 'Peito de frango grelhado', qty: '120 g', kcal: '192', p: '38.4', c: '0', g: '3.6' },
  ],
};
const PLAN = plannedFromMeal(meal as any);
const plateAi = (over: Record<string, unknown> = {}) => ({
  itens: [
    { alimento: 'Arroz branco cozido', alternativas: ['Arroz integral'], gramas_estimadas: 150, faixa_gramas: [120, 180], confianca: 0.8 },
    { alimento: 'Peito de frango grelhado', alternativas: [], gramas_estimadas: 100, faixa_gramas: [80, 130], confianca: 0.8 },
    { alimento: 'Brócolis cozido', alternativas: [], gramas_estimadas: 50, faixa_gramas: [30, 70], confianca: 0.7 },
  ],
  peso_total_lido: null, prato_tarado: null, observacao: '', ...over,
});

beforeAll(() => {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 960 });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: () => {} })) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => `data:image/jpeg;base64,FOTO${++mock.shot}`);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => {} }] })) },
  });
});
beforeEach(() => { mock.invoke.mockReset(); mock.insert.mockReset(); mock.shot = 0; localStorage.clear(); });
afterEach(() => cleanup());

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};
const rowGrams = () => screen.getAllByLabelText(/^Gramas de /).map((el) => Number((el as HTMLInputElement).value));

describe('Prato pronto — regras puras', () => {
  it('distribui o peso lido na proporção das estimativas e a soma bate exatamente com o total', () => {
    const parts = distributeToTotal([150, 100, 50], 523);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(523);
    expect(parts).toEqual([262, 174, 87]);
    expect(distributeToTotal([0, 0, 0], 100)).toEqual([34, 33, 33]);
    expect(distributeToTotal([10, 10], 333.6).reduce((a, b) => a + b, 0)).toBe(334);
  });

  it('com a balança no visor, as gramas não digitadas dividem o resto do total', () => {
    const ai = normalizePlateEstimate(plateAi({ peso_total_lido: 360, prato_tarado: true }))!;
    const rows = applyPlateTotal(resolvePlateRows(ai, FOODS as any, PLAN), plateFoodTotal(ai, null));
    expect(rows.map((r) => Number(r.grams))).toEqual([180, 120, 60]);
    // O aluno fixa o frango em 150 g: arroz e brócolis dividem os 210 g restantes.
    const edited = applyPlateTotal(rows.map((r, i) => (i === 1 ? { ...r, grams: '150', gramsEdited: true } : r)), 360);
    expect(edited.map((r) => Number(r.grams))).toEqual([158, 150, 52]);
    expect(edited.reduce((a, r) => a + Number(r.grams), 0)).toBe(360);
    // Faixa acompanha o ajuste: 180 g de 150 estimados → 144–216.
    expect(formatPlateRange(180, [144, 216])).toBe('~180 g, entre 144 e 216 g');
  });

  it('pergunta da tara: prato no peso → pergunta; sem resposta ficam as estimativas; com o prato desconta', () => {
    const ai = normalizePlateEstimate(plateAi({ peso_total_lido: 700, prato_tarado: false }))!;
    expect(plateNeedsTareQuestion(ai)).toBe(true);
    expect(plateFoodTotal(ai, null)).toBeNull();
    expect(plateFoodTotal(ai, { kind: 'com_prato', pratoGramas: 400 })).toBe(300);
    expect(plateFoodTotal(ai, { kind: 'zerada' })).toBe(700);
    // A IA não soube, mas 700 g é muito mais que 300 g de comida → pergunta.
    expect(plateNeedsTareQuestion(normalizePlateEstimate(plateAi({ peso_total_lido: 700 }))!)).toBe(true);
    expect(plateNeedsTareQuestion(normalizePlateEstimate(plateAi({ peso_total_lido: 320 }))!)).toBe(false);
    expect(plateNeedsTareQuestion(normalizePlateEstimate(plateAi())!)).toBe(false);
  });

  it('itens do prato saem com origem estimado, casados com o plano e o card mostra "estimado"', () => {
    const ai = normalizePlateEstimate(plateAi())!;
    const items = buildEstimatedItems(resolvePlateRows(ai, FOODS as any, PLAN));
    expect(items.map((i) => [i.alimento, i.gramas, i.indice_plano, i.origem])).toEqual([
      ['Arroz branco cozido', 150, 0, 'estimado'], ['Peito de frango grelhado', 100, 1, 'estimado'], ['Brócolis cozido', 50, null, 'estimado'],
    ]);
    expect(items[0].faixa_gramas).toEqual([120, 180]);
    const day = dayMealFoodsFromLog({ id: 'x', log_date: '2026-11-12', meal_index: 0, created_at: 'now', items, unweighed: [], planned: PLAN });
    expect(day[0].weigh).toMatchObject({ status: 'pesado', estimado: true });
    expect(formatDayWeighLabel(day[0].weigh)).toBe('estimado ~150 g (previsto 150 g)');
    expect(day[2].weigh).toMatchObject({ status: 'fora_do_plano', estimado: true });
  });
});

describe('Prato pronto — tela', () => {
  it('escolha mostra as 3 opções; a soma das gramas bate com o peso lido e salva tudo como estimado', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { result: plateAi({ peso_total_lido: 330, prato_tarado: true }) }, error: null });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={1} dietPlanId="plano" onClose={() => {}} />);
    const choice = await screen.findByTestId('meal-weigh-mode-choice');
    expect(within(choice).getAllByRole('button').map((b) => b.textContent?.split(/(?=[A-Z][a-z]+ [a-z])/)[0])).toHaveLength(3);
    fireEvent.click(within(choice).getByRole('button', { name: /Prato pronto/ }));
    expect(await screen.findByTestId('meal-weigh-hint')).toHaveTextContent('Foto de cima, com o prato inteiro. Um garfo ou a mão perto ajuda a IA a medir.');

    await takePhoto();
    expect(mock.invoke.mock.lastCall?.[1].body).toMatchObject({
      action: 'plate_estimate', planFoods: ['Arroz branco cozido', 'Peito de frango grelhado'], addedFoods: [],
    });
    const review = await screen.findByTestId('meal-weigh-plate-review');
    expect(within(review).getByTestId('meal-weigh-estimated-warning')).toHaveTextContent('Gramas estimadas pela foto — para precisão, use a balança.');
    expect(rowGrams()).toEqual([165, 110, 55]);
    expect(rowGrams().reduce((a, b) => a + b, 0)).toBe(330);
    expect(within(review).getAllByText('Estimado')).toHaveLength(3);
    expect(within(review).getByText('~165 g, entre 132 e 198 g')).toBeInTheDocument();

    // Apagar o brócolis: arroz e frango dividem os 330 g.
    fireEvent.click(within(review).getByRole('button', { name: 'Apagar Brócolis cozido' }));
    expect(rowGrams()).toEqual([198, 132]);

    // Adicionar alimento que faltou (feijão, 40 g fixos): o resto se ajusta.
    fireEvent.click(within(review).getByRole('button', { name: /Adicionar alimento que faltou/ }));
    expect(screen.getByRole('button', { name: /Confirmar prato/ })).toBeDisabled();
    fireEvent.change(within(review).getByLabelText('Buscar alimento'), { target: { value: 'Feijão' } });
    fireEvent.click(await within(review).findByRole('button', { name: 'Feijão carioca cozido' }));
    const feijao = within(review).getByLabelText('Gramas de Feijão carioca cozido');
    fireEvent.change(feijao, { target: { value: '40' } });
    fireEvent.blur(feijao);
    expect(rowGrams()).toEqual([174, 116, 40]);

    fireEvent.click(screen.getByRole('button', { name: /Confirmar prato/ }));
    const summary = await screen.findByTestId('meal-weigh-summary');
    expect(summary).toHaveTextContent('Arroz branco cozido: previsto 150 g, estimado ~174 g');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const row = mock.insert.mock.calls[0][0];
    expect(row.items.map((i: any) => [i.alimento, i.gramas, i.origem])).toEqual([
      ['Arroz branco cozido', 174, 'estimado'], ['Peito de frango grelhado', 116, 'estimado'], ['Feijão carioca cozido', 40, 'estimado'],
    ]);
    expect(row.items.reduce((a: number, i: any) => a + i.gramas, 0)).toBe(330);
  });

  it('balança com o prato junto: pergunta antes, desconta o prato e só então confirma', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { result: plateAi({ peso_total_lido: 700, prato_tarado: false }) }, error: null });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={1} dietPlanId="plano" initialMode="plate" onClose={() => {}} />);
    await takePhoto();
    const tare = await screen.findByTestId('meal-weigh-plate-tare');
    expect(tare).toHaveTextContent('A balança estava zerada com o prato?');
    expect(screen.getByRole('button', { name: /Confirmar prato/ })).toBeDisabled();
    fireEvent.click(within(tare).getByRole('button', { name: 'Não, o prato estava junto' }));
    expect(within(tare).getByLabelText('Peso do prato')).toHaveValue('400');
    expect(rowGrams()).toEqual([150, 100, 50]);
    fireEvent.change(within(tare).getByLabelText('Peso do prato'), { target: { value: '460' } });
    expect(rowGrams().reduce((a, b) => a + b, 0)).toBe(240);
    expect(screen.getByRole('button', { name: /Confirmar prato/ })).toBeEnabled();
  });

  it('prato pronto numa refeição já pesada salva mesclando com os itens antigos', async () => {
    mock.invoke.mockResolvedValueOnce({ data: { result: {
      itens: [{ alimento: 'Peito de frango grelhado', alternativas: [], gramas_estimadas: 110, faixa_gramas: [90, 130], confianca: 0.8 }],
      peso_total_lido: null, prato_tarado: null, observacao: '',
    } }, error: null });
    const oldItem = { alimento: 'Arroz branco cozido', food_id: 'f-arroz', gramas: 154, kcal: 200, p: 3.9, c: 43.1, g: 0.3, foto_url: null, editado_pelo_aluno: false, indice_plano: 0 };
    const log = { id: 'log-old', log_date: '2026-11-12', meal_index: 1, created_at: 'antes', planned: { nome: 'Almoço', alimentos: PLAN.alimentos },
      items: [oldItem], unweighed: [{ ...PLAN.alimentos[1], indice_plano: 1, escolha: 'comeu_sem_pesar' }] };
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={1} dietPlanId="plano" addToLog={log as any} onClose={() => {}} />);
    fireEvent.click(within(await screen.findByTestId('meal-weigh-mode-choice')).getByRole('button', { name: /Prato pronto/ }));
    await takePhoto();
    expect(mock.invoke.mock.lastCall?.[1].body.addedFoods).toEqual([{ alimento: 'Arroz branco cozido', gramas: 154 }]);
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar prato/ }));
    await screen.findByTestId('meal-weigh-summary');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const row = mock.insert.mock.calls[0][0];
    expect(row.items[0]).toEqual(oldItem);
    expect(row.items[1]).toMatchObject({ alimento: 'Peito de frango grelhado', gramas: 110, indice_plano: 1, origem: 'estimado' });
    // O frango, antes "Comi sem pesar", agora está registrado (estimado).
    expect(row.unweighed).toEqual([]);
  });
});

describe('food-scanner plate_estimate (transporte simulado)', () => {
  const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const setup = (premium: boolean, aiText: string) => {
    let handler: (req: Request) => Promise<Response> = async () => new Response();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: aiText }] }), { status: 200 }));
    const foodsQuery = { select: () => foodsQuery, order: () => foodsQuery, limit: async () => ({ data: [{ name: 'Arroz branco cozido' }, { name: 'Feijão carioca cozido' }] }) };
    runInNewContext(code, {
      Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) }, rpc: async () => ({ data: premium, error: null }), from: () => foodsQuery }),
      corsHeaders: {}, fetch, Response, console: { error: vi.fn() },
    });
    const request = (body: unknown) => handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }));
    return { request, fetch };
  };
  const IMG = 'data:image/jpeg;base64,QUJD';

  it('sem premium 403 sem chamar a IA', async () => {
    const ctx = setup(false, '{}');
    expect((await ctx.request({ action: 'plate_estimate', image: IMG })).status).toBe(403);
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('manda previstos e a base no texto e normaliza itens, faixa, total e tara', async () => {
    const ctx = setup(true, 'ok {"itens":[{"alimento":"Arroz branco cozido","alternativas":["Arroz integral"],"gramas_estimadas":"150,4","faixa_gramas":[180,120],"confianca":80},{"alimento":"","gramas_estimadas":10}],"peso_total_lido":"520","prato_tarado":true,"observacao":""}');
    const res = await ctx.request({ action: 'plate_estimate', image: IMG, mealName: 'Almoço', planFoods: ['Arroz branco cozido'], pendingPlanFoods: ['Arroz branco cozido'], addedFoods: [] });
    const { result } = await res.json();
    expect(result).toEqual({
      itens: [{ alimento: 'Arroz branco cozido', alternativas: ['Arroz integral'], gramas_estimadas: 150, faixa_gramas: [120, 180], confianca: 0.8 }],
      peso_total_lido: 520, prato_tarado: true, observacao: '',
    });
    const body = JSON.parse(String((ctx.fetch.mock.calls[0] as any)[1].body));
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.thinking).toEqual({ type: 'disabled' });
    const text = body.messages[0].content[1].text as string;
    expect(text).toContain('Alimentos previstos no plano desta refeição (quando o alimento do prato for compatível, use EXATAMENTE um destes nomes): Arroz branco cozido');
    expect(text).toContain('Base de alimentos do app (fora do plano, prefira um destes nomes): Arroz branco cozido; Feijão carioca cozido');
  });
});
