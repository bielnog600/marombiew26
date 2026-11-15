// Scanner único (Scanner de alimentos + Pesar refeição) — IA, câmera e servidor sempre simulados.
import { AI_USAGE_TEST_STUBS } from './helpers/aiUsageStubs';
import React from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeNutriScore, nutriScoreGrade, nutritionQuality } from '@/lib/foodScore';
import { applyPlateTotal, normalizePlateEstimate, plateFoodTotal, resolvePlateRows } from '@/lib/mealWeigh/plateEstimate';
import { calibrationFactor, foodKey, type CalibrationSamples } from '@/lib/mealWeigh/calibration';
import { plannedFromMeal, type WeighedItem } from '@/lib/mealWeigh';
import {
  acceptLiveBarcode, applyCreatedFoods, autoToPlateAi, itemOriginChips, itemPlanLine, productGrams, readScanModePref,
  routeAutoScan, scoreTone, writeScanModePref, type AutoScanResult,
} from '@/lib/mealWeigh/unifiedScan';
import { autoAddDecision, findReferenceDuplicate } from '../../supabase/functions/_shared/foodCatalogRules';

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), shot: 0, liveCode: null as string | null }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
// Leitor de código de barras ao vivo simulado: "lê" o código assim que liga.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    async decodeFromVideoElement(_v: unknown, cb: (r: { getText: () => string } | undefined) => void) {
      if (mock.liveCode) setTimeout(() => cb({ getText: () => mock.liveCode! }), 0);
      return { stop: () => {} };
    }
  },
}));
const FOODS = [
  { id: 'f-arroz', name: 'Arroz branco cozido', calories: 130, protein: 2.5, carbs: 28, fats: 0.2, portion_size: 100 },
  { id: 'f-frango', name: 'Peito de frango grelhado', calories: 160, protein: 32, carbs: 0, fats: 3, portion_size: 100 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => table === 'foods'
      ? { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) }
      : { insert: (row: any) => { mock.insert(table, row); return { select: () => ({ single: async () => ({ data: { id: 'log-new', created_at: 'now', ...row }, error: null }) }) }; } },
    functions: { invoke: mock.invoke },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
import { answerScanApply } from './scanApplyHelper';

const meal = {
  name: 'Almoço', time: '12:30',
  foods: [
    { food: 'Arroz branco cozido', qty: '150 g', kcal: '195', p: '3.8', c: '42', g: '0.3' },
    { food: 'Peito de frango grelhado', qty: '120 g', kcal: '192', p: '38.4', c: '0', g: '3.6' },
  ],
};
const PLAN = plannedFromMeal(meal as any);
const IOGURTE = {
  product_name: 'Iogurte grego', brands: 'Vigor', serving_quantity: 100,
  nutriments: { 'energy-kcal_100g': 59, proteins_100g: 10, carbohydrates_100g: 3.6, sugars_100g: 3.6, fat_100g: 0.4, 'saturated-fat_100g': 0.1, fiber_100g: 0, salt_100g: 0.1 },
};

const auto = (over: Partial<AutoScanResult> = {}): AutoScanResult => ({
  tipo: 'prato', itens: [], gramas_lidas: null, visor_legivel: false, confianca_leitura: 0, prato_tarado: null, balanca_sem_visor: false,
  observacao: '', marca: null, produto: '', variante: null, codigo_barras_visivel: null, tabela_nutricional_visivel: false, tabela: null,
  categoria_nutriscore: 'geral', frutas_legumes_pct: null, confianca: 0.9, ...over,
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
beforeEach(() => { mock.invoke.mockReset(); mock.insert.mockReset(); mock.shot = 0; mock.liveCode = null; localStorage.clear(); });
afterEach(() => cleanup());

const takePhoto = async () => {
  const btn = await screen.findByRole('button', { name: 'Tirar foto' });
  await waitFor(() => expect(btn).toBeEnabled());
  await act(async () => { fireEvent.click(btn); });
};

describe('Scanner único — tela', () => {
  it('Automático é o padrão e o último modo fica lembrado', () => {
    expect(readScanModePref(localStorage)).toBe('auto');
    writeScanModePref(localStorage, 'plate');
    expect(readScanModePref(localStorage)).toBe('plate');
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(readScanModePref(broken)).toBe('auto');
    expect(() => writeScanModePref(broken, 'label')).not.toThrow();
  });

  it('leitura ao vivo do código mostra o produto e a nota antes da foto (sem IA)', async () => {
    mock.liveCode = '7891000100103';
    mock.invoke.mockImplementation(async (_fn: string, { body }: any) => (body.action === 'lookup'
      ? { data: { found: true, product: IOGURTE }, error: null }
      : { data: { error: 'não esperado' }, error: null }));
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-15" mealIndex={1} dietPlanId="plano" testMode onClose={() => {}} />);
    const card = await screen.findByTestId('scan-live-product', {}, { timeout: 3000 });
    await waitFor(() => expect(within(card).getByTestId('scan-live-line')).toHaveTextContent(/^Iogurte grego · nota \d+ (Excelente|Bom)$/));
    // Nenhuma foto tirada e nenhuma chamada de IA: só a busca do código.
    expect(mock.shot).toBe(0);
    expect(mock.invoke.mock.calls.map(([, o]: any) => o.body.action)).toEqual(['lookup']);

    // "Usar" abre o produto (gramas da porção do rótulo) e ele entra na lista com a nota.
    fireEvent.click(within(card).getByRole('button', { name: 'Usar' }));
    expect(await screen.findByTestId('scan-product-name')).toHaveTextContent('Iogurte grego');
    expect(screen.getByTestId('scan-product-grams-source')).toHaveTextContent('porção do rótulo');
    expect(screen.getByLabelText('Gramas')).toHaveValue('100');
    fireEvent.click(screen.getByRole('button', { name: /Próximo alimento/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ver itens' }));
    const row = await screen.findByTestId('scan-item-row');
    expect(within(row).getByTestId('scan-score')).not.toHaveTextContent('—');
    expect(within(row).getByTestId('scan-item-chips')).toHaveTextContent('rótulo');
    expect(within(row).getByTestId('scan-item-chips')).toHaveTextContent('fora do plano');
    expect(row).toHaveTextContent('100 g');
    expect(mock.invoke.mock.calls.some(([, o]: any) => o.body.action === 'scan_auto')).toBe(false);
  });

  it('lista com edição: tocar no item muda as gramas e a linha recalcula', async () => {
    mock.liveCode = '7891000100103';
    mock.invoke.mockResolvedValue({ data: { found: true, product: IOGURTE }, error: null });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-15" mealIndex={1} dietPlanId="plano" testMode onClose={() => {}} />);
    fireEvent.click(await within(await screen.findByTestId('scan-live-product', {}, { timeout: 3000 })).findByRole('button', { name: 'Usar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Próximo alimento/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ver itens' }));
    fireEvent.click(await screen.findByRole('button', { name: /Editar Iogurte grego \(Vigor\) 100 g/ }));
    const sheet = await screen.findByRole('dialog', { name: /Editar Iogurte grego/ });
    fireEvent.change(within(sheet).getByLabelText('Gramas'), { target: { value: '170' } });
    fireEvent.click(within(sheet).getByRole('button', { name: /Salvar alteração/ }));
    const row = await screen.findByTestId('scan-item-row');
    await waitFor(() => expect(row).toHaveTextContent('170 g'));
    expect(row).toHaveTextContent('100 kcal');
    expect(within(row).getByTestId('scan-score')).not.toHaveTextContent('—');
  });

  it('Automático: alimento que não existe no banco vira alimento novo da IA (ia_referencia) ao salvar', async () => {
    mock.invoke.mockImplementation(async (_fn: string, { body }: any) => {
      if (body.action === 'scan_auto') {
        return { data: { result: auto({
          tipo: 'prato',
          itens: [{ alimento: 'Tempeh grelhado', alternativas: [], gramas_estimadas: 120, faixa_gramas: [100, 140], confianca: 0.8,
            ref_100g: { kcal: 195, proteina: 20, carbo: 8, gordura: 11, fibra: 4, tabela: 'TACO' } }],
        }) }, error: null };
      }
      if (body.action === 'reference_food') return { data: { food: { id: 'f-tempeh', name: 'Tempeh grelhado' }, created: true }, error: null };
      return { data: {}, error: null };
    });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-15" mealIndex={1} dietPlanId="plano" onClose={() => {}} />);
    expect(within(await screen.findByTestId('scan-mode-chips')).getByRole('button', { name: 'Automático' })).toHaveAttribute('aria-pressed', 'true');
    await takePhoto();
    expect(mock.invoke.mock.calls.filter(([, o]: any) => o.body.action === 'scan_auto')).toHaveLength(1);
    await screen.findByTestId('meal-weigh-plate-review');
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar prato/ }));
    await answerScanApply();
    try { await screen.findByTestId('meal-weigh-summary'); } catch (e) { screen.debug(undefined, 30000); throw e; }
    expect(within(screen.getByTestId('scan-item-row')).getByTestId('scan-item-chips')).toHaveTextContent('novo · criado pela IA');
    expect(within(screen.getByTestId('scan-item-row')).getByTestId('scan-score')).toHaveTextContent('—');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    const ref = mock.invoke.mock.calls.find(([, o]: any) => o.body.action === 'reference_food')?.[1].body;
    expect(ref).toMatchObject({ name: 'Tempeh grelhado', ref: { kcal: 195, proteina: 20, carbo: 8, gordura: 11, fibra: 4 }, tabela: 'TACO' });
    const saved = mock.insert.mock.calls.find(([t]: any) => t === 'meal_weigh_logs')?.[1];
    expect(saved.items[0]).toMatchObject({ alimento: 'Tempeh grelhado', food_id: 'f-tempeh', novo_ia: true, origem: 'estimado', kcal: 234 });
  });
});

describe('Scanner único — regras', () => {
  it('Automático segue o caminho certo sem o aluno escolher', () => {
    const one = [{ alimento: 'Arroz', alternativas: [], gramas_estimadas: 150, faixa_gramas: null, confianca: 1 }];
    expect(routeAutoScan({ tipo: 'embalado', itens: [] })).toBe('product');
    expect(routeAutoScan({ tipo: 'balanca', itens: one })).toBe('scale_item');
    expect(routeAutoScan({ tipo: 'balanca', itens: [...one, ...one] })).toBe('plate');
    expect(routeAutoScan({ tipo: 'in_natura', itens: one })).toBe('plate');
    expect(routeAutoScan({ tipo: 'prato', itens: one }, 'label')).toBe('product');
  });

  it('prato na balança: as gramas somam exatamente o visor, com a calibração aplicada antes de repartir', () => {
    const r = auto({
      tipo: 'prato', gramas_lidas: 413, visor_legivel: true, prato_tarado: true,
      itens: [
        { alimento: 'Arroz branco cozido', alternativas: [], gramas_estimadas: 150, faixa_gramas: [120, 180], confianca: 0.8 },
        { alimento: 'Peito de frango grelhado', alternativas: [], gramas_estimadas: 120, faixa_gramas: [100, 140], confianca: 0.8 },
      ],
    });
    const ai = normalizePlateEstimate(autoToPlateAi(r))!;
    expect(plateFoodTotal(ai, null)).toBe(413);
    const sum = (rows: { grams: string }[]) => rows.reduce((a, x) => a + Number(x.grams), 0);
    const plain = applyPlateTotal(resolvePlateRows(ai, FOODS as any, PLAN), plateFoodTotal(ai, null));
    expect(sum(plain)).toBe(413);
    // Histórico: o aluno sempre estima o arroz baixo (fator 1,5) → o arroz pega mais do total, que continua 413.
    const samples: CalibrationSamples = { mineFood: { [foodKey('f-arroz', 'Arroz branco cozido')]: [1.5, 1.5] }, mine: [], food: {} };
    const factorFor = (food: any, name: string) => calibrationFactor(foodKey(food?.id ?? null, food?.name ?? name), samples);
    const calibrated = applyPlateTotal(resolvePlateRows(ai, FOODS as any, PLAN, [], factorFor), plateFoodTotal(ai, null));
    expect(sum(calibrated)).toBe(413);
    expect(Number(calibrated[0].grams)).toBeGreaterThan(Number(plain[0].grams));
    // Balança não zerada com o prato: pergunta, e descontando o prato a soma bate com visor − prato.
    const notTared = normalizePlateEstimate(autoToPlateAi({ ...r, gramas_lidas: 800, prato_tarado: false }))!;
    expect(plateFoodTotal(notTared, null)).toBeNull();
    expect(sum(applyPlateTotal(resolvePlateRows(notTared, FOODS as any, PLAN), plateFoodTotal(notTared, { kind: 'com_prato', pratoGramas: 387 })))).toBe(413);
  });

  it('gramas do produto: visor da balança → porção do rótulo → 100 g', () => {
    expect(productGrams(182.4, { serving_quantity: 30 })).toEqual({ grams: 182.4, from: 'balanca' });
    expect(productGrams(null, { serving_quantity: 30 })).toEqual({ grams: 30, from: 'porcao' });
    expect(productGrams(null, {})).toEqual({ grams: 100, from: 'padrao' });
  });

  it('linha da lista: nota por cor, chips de origem e previsto / no lugar de', () => {
    expect([scoreTone(80), scoreTone(60), scoreTone(30), scoreTone(10), scoreTone(null)]).toEqual(['excellent', 'good', 'poor', 'bad', 'none']);
    const fromPlan: WeighedItem = { alimento: 'Arroz branco cozido', food_id: 'f-arroz', gramas: 182, kcal: 237, p: 4.6, c: 51, g: 0.4, foto_url: null, editado_pelo_aluno: false, indice_plano: 0 };
    expect(itemOriginChips(fromPlan, PLAN)).toEqual(['balanca', 'do_plano']);
    expect(itemPlanLine(fromPlan, PLAN)).toBe('previsto 150 g');
    const product: WeighedItem = { ...fromPlan, alimento: 'Iogurte grego', indice_plano: null, origem: 'escaneado', nota: 78, fonte_gramas: 'porcao', substituiu: { indice_plano: 1, alimento: 'Peito de frango grelhado' } };
    expect(itemOriginChips(product, PLAN)).toEqual(['rotulo', 'fora_do_plano']);
    expect(itemPlanLine(product, PLAN)).toBe('no lugar de Peito de frango grelhado');
    const novo: WeighedItem = { ...fromPlan, indice_plano: null, origem: 'estimado', novo_ia: true };
    expect(itemOriginChips(novo, PLAN)).toEqual(['estimado', 'fora_do_plano', 'novo_ia']);
  });

  it('alimento novo: id provisório troca pelo criado; já existente não ganha o selo; código ao vivo valida o dígito', () => {
    const items = [{ alimento: 'Tempeh', food_id: 'ia:tempeh', novo_ia: true } as WeighedItem, { alimento: 'Tofu', food_id: 'ia:tofu', novo_ia: true } as WeighedItem];
    const out = applyCreatedFoods(items, new Map([['ia:tempeh', { id: 'f1', name: 'Tempeh', created: true }], ['ia:tofu', { id: 'f2', name: 'Tofu', created: false }]]));
    expect(out.map((i) => [i.food_id, !!i.novo_ia])).toEqual([['f1', true], ['f2', false]]);
    expect(applyCreatedFoods([{ alimento: 'X', food_id: 'ia:x' } as WeighedItem], new Map())[0].food_id).toBeNull();
    expect(acceptLiveBarcode('7891000100103')).toBe('7891000100103');
    expect(acceptLiveBarcode('7891000100104')).toBeNull();
    expect(acceptLiveBarcode('123')).toBeNull();
  });

  it('antes de criar, checa duplicado pelo nome normalizado', () => {
    const foods = [{ id: 'f-banana', name: 'Banana prata', brand: null, barcode: null }, { id: 'f-tofu', name: 'Tofu', brand: 'Marca X', barcode: null }];
    expect(findReferenceDuplicate('banana PRATA', foods)?.id).toBe('f-banana');
    expect(findReferenceDuplicate('Tempeh', foods)).toBeNull();
  });
});

describe('Nota (Nutri-Score) por categoria', () => {
  const soda = (sugar: number, kcal: number) => ({ 'energy-kcal_100g': kcal, sugars_100g: sugar, 'saturated-fat_100g': 0, fat_100g: 0, sodium_100g: 0.01, proteins_100g: 0, fiber_100g: 0 });
  it('refrigerante zero é B e o comum é E pelas regras de bebida (pela regra geral seriam B)', () => {
    expect(nutriScoreGrade(computeNutriScore(soda(0, 0.4), 'bebida'), 'bebida')).toBe('B');
    expect(nutriScoreGrade(computeNutriScore(soda(10.6, 42), 'bebida'), 'bebida')).toBe('E');
    expect(nutriScoreGrade(computeNutriScore(soda(10.6, 42), 'geral'))).toBe('B');
    // A IA informa a categoria: o refrigerante comum perde nota.
    expect(nutritionQuality({ nutriments: soda(10.6, 42), nutriscore_category: 'bebida' })).toBeLessThan(40);
    expect(nutritionQuality({ nutriments: soda(0, 0.4), nutriscore_category: 'bebida' })).toBeGreaterThan(65);
  });
  it('azeite usa a proporção de gordura saturada e as oleaginosas: C (pela regra geral, D)', () => {
    const azeite = { 'energy-kcal_100g': 884, 'saturated-fat_100g': 14, fat_100g: 100, sugars_100g: 0, sodium_100g: 0, proteins_100g: 0, fiber_100g: 0, 'fruits-vegetables-nuts_100g': 100 };
    expect(nutriScoreGrade(computeNutriScore(azeite, 'gordura'))).toBe('C');
    expect(nutriScoreGrade(computeNutriScore(azeite, 'geral'))).toBe('D');
  });
  it('queijo conta a proteína mesmo com muitos pontos negativos: D (pela regra geral, E)', () => {
    const cheddar = { 'energy-kcal_100g': 403, 'saturated-fat_100g': 21, fat_100g: 33, sugars_100g: 0.5, sodium_100g: 0.65, proteins_100g: 25, fiber_100g: 0 };
    expect(nutriScoreGrade(computeNutriScore(cheddar, 'queijo'))).toBe('D');
    expect(nutriScoreGrade(computeNutriScore(cheddar, 'geral'))).toBe('E');
  });
  it('nota oficial do Open Food Facts continua valendo como veio', () => {
    expect(nutritionQuality({ nutriscore_score: -5, nutriments: soda(10.6, 42), nutriscore_category: 'bebida' })).toBeCloseTo((45 / 55) * 100);
  });
});

/* ---------- Servidor: alimento novo e auto-adicionar (transporte simulado, sem IA) ---------- */

const rules = ts.transpile(readFileSync('supabase/functions/_shared/foodCatalogRules.ts', 'utf8').replace(/^export /gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
const server = ts.transpile(AI_USAGE_TEST_STUBS + readFileSync('supabase/functions/food-scanner/index.ts', 'utf8').replace(/^import .*;\n/gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });

function setupServer(opts: { premium?: boolean; foods?: any[]; review?: any } = {}) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const writes: { table: string; op: string; row: any }[] = [];
  const fetch = vi.fn();
  const from = (table: string) => {
    const q: any = {
      select: () => q, eq: () => q, ilike: () => q, is: () => q, order: () => q, limit: () => (table === 'foods' ? Promise.resolve({ data: opts.foods ?? [] }) : q),
      maybeSingle: async () => ({ data: table === 'food_scan_reviews' ? opts.review ?? null : null }),
      insert: (row: any) => { writes.push({ table, op: 'insert', row }); return { select: () => ({ single: async () => ({ data: { id: `${table}-new`, ...row }, error: null }) }), then: (r: any) => r({ error: null }) }; },
      upsert: async (row: any) => { writes.push({ table, op: 'upsert', row }); return { error: null }; },
    };
    return q;
  };
  runInNewContext(`${rules}\n${server}`, {
    Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) }, rpc: async () => ({ data: opts.premium !== false, error: null }), from }),
    corsHeaders: {}, fetch, Response, console: { error: vi.fn() },
  });
  const request = async (body: unknown) => (await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }))).json();
  return { request, writes, fetch };
}

describe('food-scanner — alimento novo da IA', () => {
  it('alimento inexistente vira foods ia_referencia (TACO) e fica pendente para o admin', async () => {
    const ctx = setupServer();
    const res = await ctx.request({ action: 'reference_food', name: 'tempeh grelhado', ref: { kcal: 195, proteina: 20, carbo: 8, gordura: 11, fibra: 4 }, country: 'br' });
    expect(res.created).toBe(true);
    const food = ctx.writes.find((w) => w.table === 'foods')!.row;
    expect(food).toMatchObject({ name: 'Tempeh grelhado', source: 'ia_referencia', reference_table: 'TACO', calories: 195, protein: 20, carbs: 8, fats: 11, fiber: 4, portion_size: 100 });
    expect(ctx.writes.find((w) => w.table === 'food_scans')!.row).toMatchObject({ aluno_id: 'aluno-1', product_name: 'Tempeh grelhado', source: 'ia_referencia', score: null });
    expect(ctx.writes.find((w) => w.table === 'food_scan_reviews')!.row).toMatchObject({ product_key: 'nm:tempeh grelhado|', status: 'pendente', food_id: 'foods-new' });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });
  it('Portugal cita INSA/PortFIR; nome já existente não cria outro', async () => {
    const pt = setupServer();
    await pt.request({ action: 'reference_food', name: 'Seitan', ref: { kcal: 370, proteina: 75, carbo: 14, gordura: 1.9 }, country: 'pt' });
    expect(pt.writes.find((w) => w.table === 'foods')!.row.reference_table).toBe('INSA/PortFIR');
    const dup = setupServer({ foods: [{ id: 'f-seitan', name: 'Seitan', brand: null, barcode: null }] });
    const res = await dup.request({ action: 'reference_food', name: 'seitan', ref: { kcal: 370, proteina: 75, carbo: 14, gordura: 1.9 }, country: 'pt' });
    expect(res).toMatchObject({ created: false, food: { id: 'f-seitan' } });
    expect(dup.writes).toHaveLength(0);
  });
  it('macros absurdos são recusados e sem Premium responde 403', async () => {
    expect((await setupServer().request({ action: 'reference_food', name: 'Banana', ref: { kcal: 2000, proteina: 1, carbo: 1, gordura: 1 } })).error).toBeTruthy();
    expect((await setupServer({ premium: false }).request({ action: 'reference_food', name: 'Banana', ref: { kcal: 89, proteina: 1.1, carbo: 22.8, gordura: 0.3 } })).error).toMatch(/Premium/);
  });
});

describe('food-scanner — produto escaneado entra sozinho no banco', () => {
  const product = { product_name: 'Iogurte grego', brands: 'Vigor', serving_quantity: 100, nutriments: IOGURTE.nutriments };
  it('completo e sem duplicado: entra em foods e a revisão fica adicionado (auto, pelo sistema)', async () => {
    const ctx = setupServer();
    const res = await ctx.request({ action: 'register_product', product, barcode: '7891000100103', source: 'openfoodfacts' });
    expect(res.added).toBe(true);
    expect(ctx.writes.find((w) => w.table === 'foods')!.row).toMatchObject({ name: 'Iogurte grego', brand: 'Vigor', barcode: '7891000100103', calories: 59, protein: 10, portion_size: 100 });
    expect(ctx.writes.find((w) => w.table === 'food_scan_reviews')!.row).toMatchObject({ product_key: 'bc:7891000100103', status: 'adicionado', auto: true, reviewed_by: null, food_id: 'foods-new' });
  });
  it('incompleto, duplicado, já revisado ou lido pela IA com baixa confiança ficam pendentes', async () => {
    expect((await setupServer().request({ action: 'register_product', product: { ...product, serving_quantity: null }, barcode: '7891000100103' })).reason).toBe('incompleto');
    expect((await setupServer({ foods: [{ id: 'x', name: 'Outro', brand: null, barcode: '7891000100103' }] }).request({ action: 'register_product', product, barcode: '7891000100103' })).reason).toBe('duplicado');
    expect((await setupServer({ review: { status: 'ignorado' } }).request({ action: 'register_product', product, barcode: '7891000100103' })).reason).toBe('ja_revisado');
    expect((await setupServer().request({ action: 'register_product', product, barcode: null, source: 'tabela_ia', confidence: 0.5 })).reason).toBe('baixa_confianca');
    expect(autoAddDecision({ name: 'Iogurte grego', brand: 'Vigor', barcode: null, nutriments: product.nutriments, servingQuantity: 100, source: 'openfoodfacts' },
      [{ id: 'y', name: 'Iogurte Grego', brand: 'VIGOR', barcode: null }], false).reason).toBe('duplicado');
    expect(autoAddDecision({ name: 'Bolacha', brand: 'Maria', barcode: null, nutriments: { 'energy-kcal_100g': 900, proteins_100g: 1, carbohydrates_100g: 1, fat_100g: 1 }, servingQuantity: 30, source: 'openfoodfacts' }, [], false).reason).toBe('macros_suspeitos');
  });
});
