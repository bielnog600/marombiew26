import React from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildScanMealLog, foodScanInsert, naturaPortion, resolvePackagedProduct, scannedFoodItem, unitGramsFor, unitLabel,
  type PhotoIdentity, type UnitWeightRow,
} from '@/lib/foodPhotoScan';
import { groupScans } from '@/lib/foodScanReview';
import { dayMealFoodsFromLog, mealConsumedTotals } from '@/lib/mealWeigh';

/** Scanner de alimentos por foto (IA, Open Food Facts e banco sempre simulados). */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), scanInsert: vi.fn(), logInsert: vi.fn(), upload: vi.fn(), shot: 0 }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'aluno-1' } }) }));
vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: class { decodeFromConstraints() { return Promise.reject(new Error('sem câmera')); } } }));
const FOODS = [
  { id: 'f-banana', name: 'Banana', calories: 89, protein: 1.1, carbs: 23, fats: 0.3, portion_size: 100 },
  { id: 'f-ovo', name: 'Ovo', calories: 143, protein: 12.6, carbs: 0.7, fats: 9.5, portion_size: 100 },
  { id: 'f-aveia', name: 'Aveia em flocos', calories: 394, protein: 13.9, carbs: 66.6, fats: 8.5, portion_size: 100 },
];
const WEIGHTS: UnitWeightRow[] = [
  { food_id: 'f-banana', tamanho: 'pequeno', gramas: 90 }, { food_id: 'f-banana', tamanho: 'medio', gramas: 120 }, { food_id: 'f-banana', tamanho: 'grande', gramas: 150 },
  { food_id: 'f-ovo', tamanho: 'medio', gramas: 50 },
];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'foods') return { select: () => ({ order: () => Promise.resolve({ data: FOODS, error: null }) }) };
      if (table === 'food_unit_weights') return { select: () => Promise.resolve({ data: WEIGHTS, error: null }) };
      if (table === 'meal_weigh_logs') return { insert: (row: any) => { mock.logInsert(row); return { select: () => ({ single: async () => ({ data: { id: 'log-scan', created_at: 'now', ...row }, error: null }) }) }; } };
      return {
        insert: (row: any) => { mock.scanInsert(row); return { select: () => ({ single: async () => ({ data: { id: 'scan-1', created_at: 'now', ai_evaluation: null, consumed_grams: null, consumed_at: null, ...row }, error: null }) }) }; },
        update: () => ({ eq: async () => ({ error: null }) }),
        select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }),
      };
    },
    storage: { from: () => ({ upload: async (path: string) => { mock.upload(path); return { error: null }; } }) },
    functions: { invoke: mock.invoke },
  },
}));

import FoodScanner from '@/components/diet/FoodScanner';

const identity = (over: Partial<PhotoIdentity> = {}): PhotoIdentity => ({
  tipo: 'embalado', marca: 'Marilan', produto: 'Bolacha Maria', variante: null, codigo_barras_visivel: null,
  tabela_nutricional_visivel: false, tabela: null, alimento: '', tamanho: 'medio', unidades: 1, peso_balanca_g: null, confianca: 0.9,
  ...over,
});
const PRODUCT = { product_name: 'Bolacha Maria', brands: 'Marilan', nutriments: { 'energy-kcal_100g': 440, proteins_100g: 7, carbohydrates_100g: 75, fat_100g: 12 } };

beforeAll(() => {
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 1280 });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 960 });
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: () => {} })) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => `data:image/jpeg;base64,Rk9UTw==`);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: () => {} }] })) },
  });
});
beforeEach(() => { mock.invoke.mockReset(); mock.scanInsert.mockReset(); mock.logInsert.mockReset(); mock.upload.mockReset(); localStorage.clear(); });
afterEach(() => cleanup());

describe('produto embalado — ordem de busca', () => {
  const deps = (over: Record<string, any> = {}) => {
    const calls: string[] = [];
    return {
      calls,
      deps: {
        lookupBarcode: vi.fn(async (bc: string) => { calls.push(`barcode:${bc}`); return over.barcode ?? null; }),
        findKnown: vi.fn(async () => { calls.push('cache'); return over.known ?? null; }),
        searchOff: vi.fn(async () => { calls.push('off'); return over.off ?? []; }),
      },
    };
  };

  it('código de barras lido na foto usa o fluxo atual e para aí', async () => {
    const d = deps({ barcode: PRODUCT });
    const res = await resolvePackagedProduct(identity({ codigo_barras_visivel: '7896003701685' }), d.deps);
    expect(res).toEqual({ kind: 'product', source: 'openfoodfacts', product: PRODUCT, barcode: '7896003701685' });
    expect(d.calls).toEqual(['barcode:7896003701685']);
  });

  it('código não achado → produto já conhecido no app (mesma marca + produto) responde na hora', async () => {
    const d = deps({ known: { source: 'base', product: PRODUCT, barcode: null, foodId: 'food-9' } });
    const res = await resolvePackagedProduct(identity({ codigo_barras_visivel: '7896003701685' }), d.deps);
    expect(res).toMatchObject({ kind: 'product', source: 'base', foodId: 'food-9', barcode: '7896003701685' });
    expect(d.calls).toEqual(['barcode:7896003701685', 'cache']);
  });

  it('sem cadastro → Open Food Facts por nome+marca, até 3 para o aluno confirmar', async () => {
    const off = [1, 2, 3, 4].map((i) => ({ barcode: String(i), product: PRODUCT }));
    const d = deps({ off });
    const res = await resolvePackagedProduct(identity(), d.deps);
    expect(res.kind).toBe('candidates');
    expect(res.kind === 'candidates' && res.candidates.map((c) => c.barcode)).toEqual(['1', '2', '3']);
    expect(d.calls).toEqual(['cache', 'off']);
  });

  it('nada achado → tabela visível na foto (por porção vira por 100 g) ou pede a foto da tabela', async () => {
    const d = deps();
    const withTable = identity({
      tabela_nutricional_visivel: true,
      tabela: { porcao_g: 30, por_100g: null, por_porcao: { kcal: 132, proteina: 2.1, carbo: 22.5, gordura: 3.6, acucar: 6, fibra: 0.6, sodio_mg: 60 } },
    });
    const res = await resolvePackagedProduct(withTable, d.deps);
    expect(res).toMatchObject({ kind: 'product', source: 'tabela_ia' });
    expect(res.kind === 'product' && res.product.nutriments).toMatchObject({ 'energy-kcal_100g': 440, proteins_100g: 7, carbohydrates_100g: 75, fat_100g: 12, salt_100g: 0.5 });
    expect(d.calls).toEqual(['cache', 'off']);
    expect(await resolvePackagedProduct(identity(), deps().deps)).toEqual({ kind: 'need_label' });
  });
});

describe('in natura — peso médio por unidade', () => {
  it('banana média ≈ 120 g, unidades multiplicam; sem o tamanho usa o médio; visor da balança vence', () => {
    expect(unitGramsFor('f-banana', 'grande', WEIGHTS)).toBe(150);
    expect(unitGramsFor('f-ovo', 'grande', WEIGHTS)).toBe(50);
    expect(unitGramsFor('f-aveia', 'medio', WEIGHTS)).toBeNull();
    expect(unitLabel('Banana', 'medio', 120)).toBe('Banana média ≈ 120 g');
    expect(unitLabel('Ovo', 'medio', 50)).toBe('Ovo médio ≈ 50 g');
    const two = naturaPortion(identity({ tipo: 'in_natura', alimento: 'Banana', unidades: 2 }), FOODS as any, WEIGHTS);
    expect(two).toMatchObject({ unitGrams: 120, units: 2, grams: 240, fromScale: false });
    expect(two.food?.id).toBe('f-banana');
    expect(naturaPortion(identity({ tipo: 'in_natura', alimento: 'Banana', peso_balanca_g: 133 }), FOODS as any, WEIGHTS)).toMatchObject({ grams: 133, fromScale: true });
  });
});

describe('adicionar à refeição — registro do dia', () => {
  const meal = { name: 'Lanche', time: '16:00', foods: [
    { food: 'Banana', qty: '120 g', kcal: '107', p: '1.3', c: '27.6', g: '0.4' },
    { food: 'Aveia em flocos', qty: '30 g', kcal: '118', p: '4.2', c: '20', g: '2.6' },
  ] };

  it('sem registro: o plano conta como "comi sem pesar" e o item escaneado soma; alimento do plano com o mesmo nome vira o escaneado', () => {
    const ovo = buildScanMealLog(meal as any, null, scannedFoodItem(FOODS[1] as any, 100));
    expect(ovo.items).toEqual([expect.objectContaining({ alimento: 'Ovo', gramas: 100, kcal: 143, origem: 'escaneado', indice_plano: null })]);
    expect(ovo.unweighed.map((u) => u.escolha)).toEqual(['comeu_sem_pesar', 'comeu_sem_pesar']);
    expect(ovo.total_kcal).toBe(107 + 118 + 143);
    const banana = buildScanMealLog(meal as any, null, scannedFoodItem(FOODS[0] as any, 240));
    expect(banana.items[0]).toMatchObject({ indice_plano: 0, origem: 'escaneado' });
    expect(banana.total_kcal).toBe(Math.round(2.4 * 89) + 118);
    const day = dayMealFoodsFromLog({ id: 'x', log_date: 'd', meal_index: 0, created_at: 'c', ...banana });
    expect(day[0].weigh).toMatchObject({ status: 'pesado', escaneado: true, gramas: 240 });
  });

  it('com registro (pesagem): mescla, preserva os itens antigos e as escolhas', () => {
    const weighed = { alimento: 'Banana', food_id: 'f-banana', gramas: 118, kcal: 105, p: 1.3, c: 27.1, g: 0.4, foto_url: null, editado_pelo_aluno: false, indice_plano: 0 };
    const log = { id: 'old', log_date: 'd', meal_index: 0, created_at: 'c', items: [weighed],
      unweighed: [{ indice_plano: 1, alimento: 'Aveia em flocos', gramas: 30, qty: '30 g', kcal: 118, p: 4.2, c: 20, g: 2.6, escolha: 'nao_comeu' as const }],
      planned: { nome: 'Lanche', alimentos: [] as any[] } };
    const row = buildScanMealLog(meal as any, log as any, scannedFoodItem(FOODS[1] as any, 50));
    expect(row.items[0]).toEqual(weighed);
    expect(row.items[1]).toMatchObject({ alimento: 'Ovo', origem: 'escaneado' });
    expect(row.unweighed).toEqual([expect.objectContaining({ indice_plano: 1, escolha: 'nao_comeu' })]);
    expect(row.total_kcal).toBe(mealConsumedTotals(row.items, row.unweighed).kcal);
    expect(row.total_kcal).toBe(105 + 72);
  });
});

describe('produto novo → revisão do admin', () => {
  it('vai como pendente com a origem e as fotos; scans respondidos pela base não voltam para a revisão', () => {
    const row = foodScanInsert({ alunoId: 'a1', product: PRODUCT as any, barcode: null, source: 'tabela_ia', photoPaths: ['a1/p.jpg'], score: 40, label: 'Medíocre', additives: [] });
    expect(row).toMatchObject({ aluno_id: 'a1', product_name: 'Bolacha Maria', brand: 'Marilan', source: 'tabela_ia', photo_paths: ['a1/p.jpg'] });
    const groups = groupScans([
      { id: '1', created_at: '2026-11-12T10:00:00Z', score: 40, score_label: 'Medíocre', image_url: null, ...row },
      { id: '2', aluno_id: 'a2', barcode: null, product_name: 'Iogurte', brand: 'Danone', image_url: null, score: 70, score_label: 'Bom', nutriments: {}, created_at: '2026-11-12T11:00:00Z', source: 'base' },
    ] as any);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ name: 'Bolacha Maria', source: 'tabela_ia', photoPaths: ['a1/p.jpg'] });
  });
});

describe('FoodScanner — aba Foto', () => {
  const takePhoto = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Foto/, pressed: false }));
    const btn = await screen.findByRole('button', { name: 'Tirar foto' });
    await act(async () => { fireEvent.click(btn); });
  };
  const byAction = (handlers: Record<string, any>) => mock.invoke.mockImplementation(async (_fn: string, { body }: any) => ({ data: handlers[body.action] ?? {}, error: null }));

  it('embalado sem código e sem cadastro: Open Food Facts vazio → tabela da foto; salva para revisão com as fotos', async () => {
    byAction({
      identify_photo: { result: identity({
        tabela_nutricional_visivel: true,
        tabela: { porcao_g: 30, por_100g: { kcal: 440, proteina: 7, carbo: 75, gordura: 12, acucar: 20, fibra: 2, sodio_mg: 200 }, por_porcao: null },
      }) },
      find_product: { found: false },
      search_off: { candidates: [] },
      evaluate: { evaluation: 'Cabe no lanche, 30 g.' },
    });
    render(<FoodScanner open onOpenChange={() => {}} />);
    await takePhoto();
    await screen.findByText('Bolacha Maria');
    expect(mock.invoke.mock.calls.map(([, o]: any) => o.body.action)).toEqual(['identify_photo', 'find_product', 'search_off', 'evaluate']);
    expect(mock.scanInsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'tabela_ia', brand: 'Marilan', photo_paths: [expect.stringMatching(/^aluno-1\/.+\.jpg$/)] }));
    expect(await screen.findByText('Cabe no lanche, 30 g.')).toBeInTheDocument();
  });

  it('in natura: banana média, + unidade e adicionar à refeição entra no registro do dia como escaneado', async () => {
    byAction({ identify_photo: { result: identity({ tipo: 'in_natura', marca: null, produto: '', alimento: 'Banana', unidades: 2 }) } });
    const onSaved = vi.fn();
    const meals = [{ name: 'Café', time: '08:00', foods: [] }, { name: 'Lanche', time: '16:00', foods: [{ food: 'Aveia em flocos', qty: '30 g', kcal: '118', p: '4.2', c: '20', g: '2.6' }] }];
    render(<FoodScanner open onOpenChange={() => {}} mealContext={{ meals: meals as any, logDate: '2026-11-12', dietPlanId: 'plano', suggested: 1, latestLog: () => null, onSaved }} />);
    await takePhoto();
    const natura = await screen.findByTestId('scan-natura');
    await waitFor(() => expect(within(natura).getByTestId('scan-unit-label')).toHaveTextContent('Banana média ≈ 120 g'));
    expect(within(natura).getByLabelText('Gramas')).toHaveValue('240');
    fireEvent.click(within(natura).getByRole('button', { name: 'Mais uma unidade' }));
    expect(within(natura).getByLabelText('Gramas')).toHaveValue('360');
    const panel = within(natura).getByTestId('scan-add-to-meal');
    expect(within(panel).getByRole('button', { name: '16:00 · Lanche' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { fireEvent.click(within(panel).getByRole('button', { name: /Adicionar à refeição/ })); });
    const row = mock.logInsert.mock.calls[0][0];
    expect(row).toMatchObject({ student_id: 'aluno-1', log_date: '2026-11-12', meal_index: 1, meal_name: 'Lanche' });
    expect(row.items).toEqual([expect.objectContaining({ alimento: 'Banana', gramas: 360, origem: 'escaneado' })]);
    expect(row.total_kcal).toBe(118 + Math.round(3.6 * 89));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-scan', meal_index: 1 }));
    expect(mock.scanInsert).not.toHaveBeenCalled();
  });
});

describe('food-scanner identify_photo / find_product / search_off (transporte simulado)', () => {
  const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
  const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const setup = (aiText: string, tables: Record<string, any[]> = {}, off: any = { products: [] }) => {
    let handler: (req: Request) => Promise<Response> = async () => new Response();
    const fetch = vi.fn(async (url: string) => String(url).includes('openfoodfacts')
      ? new Response(JSON.stringify(off), { status: 200 })
      : new Response(JSON.stringify({ content: [{ type: 'text', text: aiText }] }), { status: 200 }));
    const q = (rows: any[]) => { const o: any = { select: () => o, is: () => o, ilike: () => o, order: () => o, upsert: async () => ({}), limit: async () => ({ data: rows }) }; return o; };
    runInNewContext(code, {
      Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) }, rpc: async () => ({ data: false, error: null }), from: (t: string) => q(tables[t] ?? []) }),
      corsHeaders: {}, fetch, Response, console: { error: vi.fn() },
    });
    const request = async (body: unknown) => (await handler(new Request('https://e.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) }))).json();
    return { request, fetch };
  };

  it('identify_photo vale para qualquer aluno (sem Premium) e normaliza tipo, código e tamanho', async () => {
    const ctx = setup('{"tipo":"in_natura","alimento":"Banana","tamanho":"Médio","unidades":"2","peso_balanca_g":null,"codigo_barras_visivel":"78-91","confianca":90}');
    const { result } = await ctx.request({ action: 'identify_photo', image: 'data:image/jpeg;base64,QUJD' });
    expect(result).toMatchObject({ tipo: 'in_natura', alimento: 'Banana', tamanho: 'medio', unidades: 2, codigo_barras_visivel: null, confianca: 0.9, tabela: null });
  });

  it('find_product: aprovado na base responde na hora, sem IA', async () => {
    const ctx = setup('', { foods: [{ id: 'food-9', name: 'Bolacha Maria', brand: 'Marilan', barcode: null, portion_size: 30, calories: 132, protein: 2.1, carbs: 22.5, fats: 3.6 }] });
    const res = await ctx.request({ action: 'find_product', brand: 'Marilan', product: 'Bolacha Maria' });
    expect(res).toMatchObject({ found: true, source: 'base', food_id: 'food-9', product: { nutriments: { 'energy-kcal_100g': 440 } } });
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it('search_off busca no Open Food Facts do país e devolve até 3 com tabela', async () => {
    const products = [1, 2, 3, 4].map((i) => ({ code: `78${i}`, product_name: `Bolacha ${i}`, nutriments: { 'energy-kcal_100g': 400 + i } }));
    const ctx = setup('', {}, { products: [{ code: '1', product_name: 'Sem tabela', nutriments: {} }, ...products] });
    const { candidates } = await ctx.request({ action: 'search_off', brand: 'Marilan', product: 'Bolacha Maria', country: 'pt' });
    expect(candidates.map((c: any) => c.barcode)).toEqual(['781', '782', '783']);
    expect(String(ctx.fetch.mock.calls[0][0])).toContain('https://pt.openfoodfacts.org/cgi/search.pl?search_terms=Marilan%20Bolacha%20Maria');
  });
});
