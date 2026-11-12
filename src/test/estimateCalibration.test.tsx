import React from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { plannedFromMeal, type WeighedItem } from '@/lib/mealWeigh';
import { rebuildWeighedItem } from '@/lib/mealWeigh/editItems';
import {
  applyPlateTotal, buildEstimatedItems, buildPlateEstimateRequest, normalizePlateEstimate, resolvePlateRows,
} from '@/lib/mealWeigh/plateEstimate';
import {
  adminCorrectEstimatedItem, calibrationEnabledFrom, calibrationFactor, correctionsFromItems, estimateErrorByWeek, foodKey,
  formatCalibrationLine, placeWeighedItem, recentPromptCorrections, samplesFromCorrections, scaleCorrectionRow,
} from '@/lib/mealWeigh/calibration';

/** Calibração das gramas estimadas: o app aprende com as correções (IA e banco sempre simulados). */

const mock = vi.hoisted(() => ({ invoke: vi.fn(), insert: vi.fn(), upsert: vi.fn(), rpc: vi.fn(), recent: [] as any[], shot: 0 }));
vi.mock('@/hooks/useHoldAppUpdate', () => ({ useHoldAppUpdate: () => {} }));
const FOODS = [
  { id: 'f-iog', name: 'Iogurte natural integral', calories: 61, protein: 3.5, carbs: 4.7, fats: 3.3, portion_size: 100 },
  { id: 'f-pasta', name: 'Pasta de amendoim', calories: 588, protein: 25, carbs: 20, fats: 50, portion_size: 100 },
  { id: 'f-aveia', name: 'Aveia em flocos', calories: 394, protein: 14, carbs: 66, fats: 8.5, portion_size: 100 },
];

/** Construtor encadeável de consultas: resolve conforme a tabela e as operações chamadas. */
function query(table: string) {
  const ops: [string, any[]][] = [];
  const result = () => {
    const has = (op: string) => ops.find(([o]) => o === op);
    if (table === 'foods') return { data: FOODS, error: null };
    if (table === 'app_settings') return { data: null, error: null };
    if (table === 'meal_weigh_logs' && has('insert')) return { data: { id: 'log-new', created_at: 'now', ...has('insert')![1][0] }, error: null };
    if (table === 'estimate_corrections' && has('upsert')) return { data: null, error: null };
    if (table === 'estimate_corrections' && has('limit')) return { data: mock.recent, error: null };
    return { data: [], error: null };
  };
  const b: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
      return (...args: any[]) => {
        ops.push([prop, args]);
        if (prop === 'insert') mock.insert(table, args[0]);
        if (prop === 'upsert') mock.upsert(table, args[0], args[1]);
        return b;
      };
    },
  });
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => query(t), rpc: (...a: any[]) => mock.rpc(...a), functions: { invoke: mock.invoke } },
}));

import MealWeighScreen from '@/components/diet/mealWeigh/MealWeighScreen';
import PlateReview from '@/components/diet/mealWeigh/PlateReview';

const meal = {
  name: 'Lanche', time: '16:00',
  foods: [
    { food: 'Iogurte natural integral', qty: '170 g', kcal: '104', p: '6', c: '8', g: '5.6' },
    { food: 'Pasta de amendoim', qty: '30 g', kcal: '176', p: '7.5', c: '6', g: '15' },
  ],
};
const PLAN = plannedFromMeal(meal as any);
const plateAi = (over: Record<string, unknown> = {}) => ({
  itens: [
    { alimento: 'Iogurte natural integral', alternativas: [], gramas_estimadas: 150, faixa_gramas: [130, 170], confianca: 0.8 },
    { alimento: 'Pasta de amendoim', alternativas: [], gramas_estimadas: 35, faixa_gramas: [25, 45], confianca: 0.7 },
  ],
  peso_total_lido: null, prato_tarado: null, observacao: '', ...over,
});
const ids = () => { let n = 0; return () => `est-${++n}`; };
const IOG = foodKey('f-iog', 'Iogurte natural integral');
const PASTA = foodKey('f-pasta', 'Pasta de amendoim');

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
beforeEach(() => {
  mock.invoke.mockReset(); mock.insert.mockReset(); mock.upsert.mockReset(); mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({ data: [], error: null });
  mock.recent = []; mock.shot = 0; localStorage.clear();
});
afterEach(() => cleanup());

describe('Calibração — correções gravadas', () => {
  it('a correção compara com a estimativa ORIGINAL da IA, mesmo com ajuste e depois em "Editar pesagem"', () => {
    const ai = normalizePlateEstimate(plateAi())!;
    // Histórico +40% no iogurte: o app sugere 210 g, mas a estimativa original continua 150 g.
    const rows = resolvePlateRows(ai, FOODS as any, PLAN, [], (f) => (f?.id === 'f-iog' ? { factor: 1.4, scope: 'aluno_alimento', samples: 2 } : { factor: 1, scope: 'nenhum', samples: 0 }));
    expect(rows[0].grams).toBe('210');
    const edited = rows.map((r, i) => (i === 0 ? { ...r, grams: '161', gramsEdited: true } : r));
    const items = buildEstimatedItems(edited, ids());
    const out = correctionsFromItems(items, { studentId: 'aluno', mealLogId: 'log-1' });
    expect(out.upserts).toEqual([{
      student_id: 'aluno', estimate_id: 'est-1', food_id: 'f-iog', food_key: 'f-iog', food_name: 'Iogurte natural integral',
      estimated_g: 150, adjusted_g: 210, factor: 1.4, real_g: 161, fonte: 'aluno', meal_log_id: 'log-1',
    }]);
    // A pasta não foi mexida: não é correção.
    expect(out.removeIds).toEqual([]);

    // "Editar pesagem" depois: a pasta vira 49 g → correção contra os 35 g originais.
    const pasta = rebuildWeighedItem(items[1], { food: FOODS[1] as any, grams: 49, planIndex: 1 });
    expect(pasta).toMatchObject({ gramas: 49, gramas_estimadas: 35, estimativa_id: 'est-2', gramas_corrigidas: true, origem: 'estimado' });
    expect(correctionsFromItems([pasta], { studentId: 'aluno', mealLogId: 'log-2' }).upserts[0]).toMatchObject({ estimated_g: 35, real_g: 49 });
  });

  it('ignora correção absurda (< 0,3 ou > 3) e quando o aluno trocou o alimento', () => {
    const items = buildEstimatedItems(resolvePlateRows(normalizePlateEstimate(plateAi())!, FOODS as any, PLAN), ids());
    const absurd = { ...items[0], gramas: 40, gramas_corrigidas: true }; // 40/150 < 0,3
    const huge = { ...items[1], gramas: 110, gramas_corrigidas: true }; // 110/35 > 3
    expect(correctionsFromItems([absurd, huge], { studentId: 'aluno', mealLogId: null })).toEqual({ upserts: [], removeIds: ['est-1', 'est-2'] });
    const swapped = rebuildWeighedItem(items[0], { food: FOODS[2] as any, grams: 60, planIndex: null });
    expect(swapped.alimento_corrigido).toBe(true);
    expect(correctionsFromItems([swapped], { studentId: 'aluno', mealLogId: null }).upserts).toEqual([]);
  });

  it('estimado depois pesado na balança na mesma refeição vira correção "balanca" e o pesado ocupa o lugar', () => {
    const items = buildEstimatedItems(resolvePlateRows(normalizePlateEstimate(plateAi())!, FOODS as any, PLAN), ids());
    const weighed: WeighedItem = { alimento: 'Pasta de amendoim', food_id: 'f-pasta', gramas: 49, kcal: 288, p: 12.3, c: 9.8, g: 24.5, foto_url: null, editado_pelo_aluno: false, indice_plano: 1 };
    const placed = placeWeighedItem(items, ['', ''], weighed, 'FOTO', 'upsert');
    expect(placed.items.map((i) => [i.alimento, i.gramas, i.origem ?? 'pesado'])).toEqual([
      ['Iogurte natural integral', 150, 'estimado'], ['Pasta de amendoim', 49, 'pesado'],
    ]);
    expect(scaleCorrectionRow(placed.replaced!, weighed, 'aluno')).toMatchObject({ fonte: 'balanca', estimated_g: 35, real_g: 49, estimate_id: 'est-2' });
  });
});

describe('Calibração — fator', () => {
  const rec = (student: string, key: string, est: number, real: number, day: number) =>
    ({ student_id: student, food_key: key, estimated_g: est, real_g: real, created_at: `2026-11-${String(day).padStart(2, '0')}T12:00:00Z` });

  it('(aluno, alimento) com 2 correções → mediana; com 1 cai para (aluno, todos) com ≥ 3', () => {
    const two = samplesFromCorrections([rec('a', IOG, 150, 161, 10), rec('a', IOG, 100, 120, 11)], 'a');
    expect(calibrationFactor(IOG, two)).toEqual({ factor: 1.137, scope: 'aluno_alimento', samples: 2 });
    const one = samplesFromCorrections([rec('a', IOG, 150, 161, 10)], 'a');
    expect(calibrationFactor(IOG, one)).toEqual({ factor: 1, scope: 'nenhum', samples: 0 });
    const mine = samplesFromCorrections([rec('a', IOG, 100, 110, 1), rec('a', PASTA, 35, 49, 2), rec('a', PASTA, 30, 39, 3)], 'a');
    expect(calibrationFactor('f-aveia', mine)).toEqual({ factor: 1.3, scope: 'aluno', samples: 3 });
  });

  it('(alimento, todos os alunos) só com ≥ 5; senão 1', () => {
    const four = [1, 2, 3, 4].map((d) => rec(`x${d}`, PASTA, 35, 49, d));
    expect(calibrationFactor(PASTA, samplesFromCorrections(four, 'a')).scope).toBe('nenhum');
    const five = [...four, rec('x5', PASTA, 35, 42, 5)];
    expect(calibrationFactor(PASTA, samplesFromCorrections(five, 'a'))).toEqual({ factor: 1.4, scope: 'alimento', samples: 5 });
  });

  it('limita entre 0,6 e 1,6 e usa só as últimas 20 correções', () => {
    const big = samplesFromCorrections([rec('a', IOG, 100, 250, 1), rec('a', IOG, 100, 280, 2)], 'a');
    expect(calibrationFactor(IOG, big).factor).toBe(1.6);
    const small = samplesFromCorrections([rec('a', IOG, 100, 35, 1), rec('a', IOG, 100, 40, 2)], 'a');
    expect(calibrationFactor(IOG, small).factor).toBe(0.6);
    // 20 recentes a ×1,1 e 15 antigas a ×2: as antigas ficam de fora.
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => ({ ...rec('a', IOG, 100, 110, 10), created_at: `2026-11-12T10:${String(i).padStart(2, '0')}:00Z` })),
      ...Array.from({ length: 15 }, (_, i) => ({ ...rec('a', IOG, 100, 200, 1), created_at: `2026-10-01T10:${String(i).padStart(2, '0')}:00Z` })),
    ];
    expect(calibrationFactor(IOG, samplesFromCorrections(rows, 'a'))).toEqual({ factor: 1.1, scope: 'aluno_alimento', samples: 20 });
  });

  it('linha do ajuste, liga/desliga padrão e erro médio antes × depois', () => {
    expect(formatCalibrationLine({ factor: 1.4, scope: 'aluno_alimento' })).toBe('Ajustado pelo seu histórico (+40%)');
    expect(formatCalibrationLine({ factor: 0.88, scope: 'aluno' })).toBe('Ajustado pelo seu histórico (-12%)');
    expect(formatCalibrationLine({ factor: 1, scope: 'nenhum' })).toBeNull();
    expect(calibrationEnabledFrom(undefined)).toBe(true);
    expect(calibrationEnabledFrom(false)).toBe(false);
    const weeks = estimateErrorByWeek([
      { student_id: 'a', food_key: IOG, estimated_g: 150, adjusted_g: 160, real_g: 160, created_at: '2026-11-11T12:00:00Z' },
      { student_id: 'a', food_key: PASTA, estimated_g: 35, adjusted_g: 49, real_g: 49, created_at: '2026-11-10T12:00:00Z' },
    ], new Date('2026-11-12T12:00:00Z'));
    expect(weeks).toEqual([{ weekStart: '2026-11-09', n: 2, before: 17.4, after: 0 }]);
  });
});

describe('Calibração — exemplos para a IA', () => {
  it('o pedido leva as últimas 5 correções do aluno, da mais recente para a mais antiga', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ food_name: `Alimento ${i}`, estimated_g: 100, real_g: 110 + i, created_at: `2026-11-0${i + 1}T10:00:00Z` }));
    const recent = recentPromptCorrections(rows);
    expect(recent.map((r) => r.alimento)).toEqual(['Alimento 6', 'Alimento 5', 'Alimento 4', 'Alimento 3', 'Alimento 2']);
    const body = buildPlateEstimateRequest({ photo: 'x', mealName: 'Lanche', planned: PLAN, items: [], corrections: recent });
    expect(body.corrections).toHaveLength(5);
  });

  it('food-scanner coloca as correções no texto do plate_estimate e devolve balanca_sem_visor', async () => {
    const source = readFileSync('supabase/functions/food-scanner/index.ts', 'utf8').replace(/^import .*;\n/gm, '');
    const code = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
    let handler: (req: Request) => Promise<Response> = async () => new Response();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"itens":[{"alimento":"Iogurte natural integral","gramas_estimadas":150}],"peso_total_lido":null,"prato_tarado":null,"balanca_sem_visor":true,"observacao":""}' }] }), { status: 200 }));
    const foodsQuery = { select: () => foodsQuery, order: () => foodsQuery, limit: async () => ({ data: [] }) };
    runInNewContext(code, {
      Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
      createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'aluno-1' } } }) }, rpc: async () => ({ data: true, error: null }), from: () => foodsQuery }),
      corsHeaders: {}, fetch, Response, console: { error: vi.fn() },
    });
    const corrections = [
      { alimento: 'Iogurte natural integral', estimado: 150, real: 161 },
      { alimento: 'Pasta de amendoim', estimado: 35, real: 49 },
      ...Array.from({ length: 5 }, (_, i) => ({ alimento: `Extra ${i}`, estimado: 100, real: 100 })),
    ];
    const res = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer t' },
      body: JSON.stringify({ action: 'plate_estimate', image: 'data:image/jpeg;base64,QUJD', corrections }) }));
    const { result } = await res.json();
    expect(result.balanca_sem_visor).toBe(true);
    const text = JSON.parse(String((fetch.mock.calls[0] as any)[1].body)).messages[0].content[1].text as string;
    expect(text).toContain('Iogurte natural integral: você estimou 150 g, era 161 g; Pasta de amendoim: você estimou 35 g, era 49 g');
    expect(text).toContain('Extra 2');
    expect(text).not.toContain('Extra 3');
  });
});

describe('Calibração — admin', () => {
  it('admin corrige as gramas de um item estimado salvo: totais recalculados e correção "admin"', () => {
    const items = buildEstimatedItems(resolvePlateRows(normalizePlateEstimate(plateAi())!, FOODS as any, PLAN), ids());
    const log = { id: 'log-1', log_date: '2026-11-12', meal_index: 2, created_at: 'now', items, unweighed: [], planned: { ...PLAN } };
    const edit = adminCorrectEstimatedItem(log as any, 'aluno', 1, 49, FOODS as any)!;
    expect(edit.items[1]).toMatchObject({ gramas: 49, origem: 'estimado', gramas_estimadas: 35, corrigido_por_admin: true });
    expect(edit.items[0]).toEqual(items[0]);
    expect(edit.totals.kcal).toBe(Math.round(Number(items[0].kcal) + Number(edit.items[1].kcal)));
    expect(edit.correction).toMatchObject({ fonte: 'admin', estimated_g: 35, real_g: 49, student_id: 'aluno', estimate_id: 'est-2' });
    // Item pesado (não estimado) não é editável por aqui.
    expect(adminCorrectEstimatedItem({ ...log, items: [{ ...items[0], origem: undefined }] } as any, 'aluno', 0, 100)).toBeNull();
  });
});

describe('Calibração — tela', () => {
  it('revisão mostra a estimativa ajustada, a faixa recalculada e redistribui com o peso lido', () => {
    const samples = { mineFood: { [IOG]: [1.4, 1.4] }, mine: [1.4, 1.4], food: {} };
    const { unmount } = render(<PlateReview header={null} photo="p" ai={normalizePlateEstimate(plateAi())!} samples={samples} planned={PLAN} existing={[]} foods={FOODS as any} onRetake={() => {}} onConfirm={() => {}} />);
    const iog = screen.getByLabelText('Iogurte natural integral');
    expect(within(iog).getByTestId('plate-row-calibration')).toHaveTextContent('Ajustado pelo seu histórico (+40%)');
    expect(within(iog).getByText('~210 g, entre 182 e 238 g')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Pasta de amendoim')).queryByTestId('plate-row-calibration')).toBeNull();
    unmount();
    // Com 245 g na balança: 210 (ajustado) e 35 dividem o total na mesma proporção.
    const ai = normalizePlateEstimate(plateAi({ peso_total_lido: 245, prato_tarado: true }))!;
    render(<PlateReview header={null} photo="p" ai={ai} samples={samples} planned={PLAN} existing={[]} foods={FOODS as any} onRetake={() => {}} onConfirm={() => {}} />);
    expect(screen.getAllByLabelText(/^Gramas de /).map((el) => (el as HTMLInputElement).value)).toEqual(['210', '35']);
    expect(screen.queryByTestId('meal-weigh-plate-scale-hint')).toBeNull();
    // 300 g lidos: sem ajuste 150 × 35 → 243/57; com o iogurte +40% os pesos viram 210 × 35 → 257/43.
    const plain = applyPlateTotal(resolvePlateRows(ai, FOODS as any, PLAN), 300);
    expect(plain.map((r) => r.grams)).toEqual(['243', '57']);
    const calibrated = applyPlateTotal(resolvePlateRows(ai, FOODS as any, PLAN, [], (f) => (f?.id === 'f-iog' ? { factor: 1.4, scope: 'aluno', samples: 3 } : { factor: 1, scope: 'nenhum', samples: 0 })), 300);
    expect(calibrated.map((r) => r.grams)).toEqual(['257', '43']);
  });

  it('dica do visor quando a IA viu a balança sem o visor', () => {
    render(<PlateReview header={null} photo="p" ai={normalizePlateEstimate(plateAi({ balanca_sem_visor: true }))!} planned={PLAN} existing={[]} foods={FOODS as any} onRetake={() => {}} onConfirm={() => {}} />);
    expect(screen.getByTestId('meal-weigh-plate-scale-hint')).toHaveTextContent('Deixa o visor da balança aparecendo — assim a soma fica exata');
  });

  it('fluxo: manda as últimas correções para a IA, ajusta e grava a correção ao salvar', async () => {
    mock.recent = [{ food_name: 'Iogurte natural integral', estimated_g: 150, real_g: 161, created_at: '2026-11-11T10:00:00Z' }];
    mock.rpc.mockResolvedValue({ data: [{ scope: 'aluno_alimento', food_key: IOG, ratio: 1.4 }, { scope: 'aluno_alimento', food_key: IOG, ratio: 1.4 }], error: null });
    mock.invoke.mockResolvedValueOnce({ data: { result: plateAi() }, error: null });
    render(<MealWeighScreen meal={meal as any} studentId="aluno" logDate="2026-11-12" mealIndex={2} dietPlanId="plano" initialMode="plate" onClose={() => {}} />);
    const btn = await screen.findByRole('button', { name: 'Tirar foto' });
    await waitFor(() => expect(btn).toBeEnabled());
    await act(async () => { fireEvent.click(btn); });
    const review = await screen.findByTestId('meal-weigh-plate-review');
    expect(mock.invoke.mock.lastCall?.[1].body.corrections).toEqual([{ alimento: 'Iogurte natural integral', estimado: 150, real: 161 }]);
    expect(mock.rpc).toHaveBeenCalledWith('estimate_calibration_samples', { _food_keys: [IOG, PASTA] });
    const iog = within(review).getByLabelText('Gramas de Iogurte natural integral') as HTMLInputElement;
    expect(iog.value).toBe('210');
    fireEvent.change(iog, { target: { value: '190' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar prato/ }));
    await screen.findByTestId('meal-weigh-summary');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })); });
    await waitFor(() => expect(mock.upsert).toHaveBeenCalled());
    const [table, rows, opts] = mock.upsert.mock.calls[0];
    expect(table).toBe('estimate_corrections');
    expect(opts).toEqual({ onConflict: 'student_id,estimate_id' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ food_name: 'Iogurte natural integral', estimated_g: 150, adjusted_g: 210, factor: 1.4, real_g: 190, fonte: 'aluno', meal_log_id: 'log-new' });
  });
});
