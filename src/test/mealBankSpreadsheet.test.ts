import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { FoodRecord } from '@/lib/nutritionEngine';
import type { BankMeal } from '@/lib/mealBank';
import {
  buildBankExportSheets,
  buildFoodMatcher,
  buildImportPlan,
  defaultResolution,
  importSummaryText,
  matchFoodName,
  parseBankWorkbook,
  parseIngredientsText,
  parseSlotLabel,
  suggestFoods,
  unmatchedFoods,
  type SheetInput,
} from '@/lib/mealBank/spreadsheet';

const food = (id: string, name: string, calories: number, protein: number, carbs: number, fats: number): FoodRecord =>
  ({ id, name, calories, protein, carbs, fats, portion_size: 100, portion: 'gramas' }) as FoodRecord;

const FOODS: FoodRecord[] = [
  food('f-ovo', 'Ovo', 143, 13, 1, 10),
  food('f-pao', 'Pão francês', 290, 9, 58, 3),
  food('f-banana', 'Banana', 89, 1, 23, 0),
  food('f-atum', 'Atum em água', 104, 24, 0, 1),
  food('f-atum2', 'Atum fresco grelhado', 130, 29, 0, 1),
  food('f-arroz', 'Arroz branco cozido', 128, 2.5, 28, 0.2),
];

const BANK: BankMeal[] = [
  { id: 'm1', code: 'CM01', slot: 'cafe_manha', name: 'Pão com ovo', origin: 'BR', tags: ['salgado', 'prático'], prep: 'Ovo mexido no pão.', active: true,
    items: [{ foodId: 'f-pao', grams: 50, ordem: 0 }, { foodId: 'f-ovo', grams: 100, ordem: 1 }] },
  { id: 'm2', code: 'AL01', slot: 'almoco', name: 'Atum com arroz', origin: 'PT', tags: [], prep: null, active: true,
    items: [{ foodId: 'f-atum', grams: 120, ordem: 0 }, { foodId: 'f-arroz', grams: 150, ordem: 1 }] },
];

const exported = () => buildBankExportSheets(BANK, FOODS);
const sheet = (sheets: SheetInput[], name: string) => sheets.find((s) => s.name === name)!;

describe('planilha do banco — leitura', () => {
  it('Horário em texto vira o horário do banco', () => {
    expect(parseSlotLabel('Café da manhã')).toBe('cafe_manha');
    expect(parseSlotLabel('Lanche da manhã')).toBe('lanche_tarde');
    expect(parseSlotLabel('Lanche da tarde')).toBe('lanche_tarde');
    expect(parseSlotLabel('Pré-treino')).toBe('pre_treino');
    expect(parseSlotLabel('Pós-treino')).toBe('pos_treino');
    expect(parseSlotLabel('Almoço')).toBe('almoco');
    expect(parseSlotLabel('Jantar')).toBe('jantar');
    expect(parseSlotLabel('Ceia')).toBe('ceia');
    expect(parseSlotLabel('Brunch')).toBeNull();
  });

  it('lê a coluna "Alimentos (g)"', () => {
    const items = parseIngredientsText('Pão francês 50g; Ovo inteiro 100g; Banana 1,5 g; Tomate g');
    expect(items.map((i) => [i.name, i.grams])).toEqual([['Pão francês', 50], ['Ovo inteiro', 100], ['Banana', 1.5], ['Tomate g', null]]);
  });

  it('casa por nome exato, normalizado (acento, maiúsculas, plural) e pelo nome ligado antes', () => {
    const m = buildFoodMatcher(FOODS, [{ alias: 'ovo inteiro', food_id: 'f-ovo' }]);
    expect(matchFoodName('Pão francês', m)?.via).toBe('exato');
    expect(matchFoodName('PAO FRANCES', m)?.food.id).toBe('f-pao');
    expect(matchFoodName('Ovos', m)?.food.id).toBe('f-ovo');
    expect(matchFoodName('Bananas', m)?.food.id).toBe('f-banana');
    expect(matchFoodName('Ovo Inteiro', m)).toMatchObject({ via: 'apelido', food: { id: 'f-ovo' } });
    expect(matchFoodName('Atum ao natural', m)).toBeNull();
  });

  it('sugere "Atum em água" para "Atum ao natural"', () => {
    expect(suggestFoods('Atum ao natural', FOODS)[0].name).toBe('Atum em água');
  });
});

describe('planilha do banco — exportar e importar de volta', () => {
  it('exporta as 3 abas com kcal calculados e volta sem mudança', () => {
    const sheets = exported();
    expect(sheets.map((s) => s.name)).toEqual(['Refeições', 'Ingredientes', 'Alimentos usados']);
    const row = sheet(sheets, 'Refeições').rows[1];
    // 50 g pão (145) + 100 g ovo (143)
    expect(row.slice(0, 7)).toEqual(['CM01', 'Café da manhã', 'Pão com ovo', 'BR', 'salgado, prático', 'Pão francês 50g; Ovo 100g', 288]);
    expect(sheet(sheets, 'Ingredientes').rows).toHaveLength(5);
    expect(sheet(sheets, 'Alimentos usados').rows.find((r) => r[0] === 'Atum em água')).toEqual(['Atum em água', 104, 24, 0, 1]);

    const parsed = parseBankWorkbook(sheets);
    const plan = buildImportPlan({ parsed, bank: BANK, matcher: buildFoodMatcher(FOODS), resolutions: {} });
    expect(plan.counts).toEqual({ nova: 0, atualizada: 0, sem_mudanca: 2, erro: 0 });
  });

  it('o arquivo .xlsx gravado lê de volta igual', () => {
    const wb = XLSX.utils.book_new();
    for (const s of exported()) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows as unknown[][]), s.name);
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'array' });
    const sheets = back.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(back.Sheets[name], { header: 1, raw: true, defval: '' }) }));
    const plan = buildImportPlan({ parsed: parseBankWorkbook(sheets), bank: BANK, matcher: buildFoodMatcher(FOODS), resolutions: {} });
    expect(plan.counts.sem_mudanca).toBe(2);
  });

  it('1 refeição alterada + 1 nova com "Atum ao natural": pendente até ligar, kcal da planilha ignorado', () => {
    const sheets = exported();
    const meals = sheet(sheets, 'Refeições').rows;
    const ingredients = sheet(sheets, 'Ingredientes').rows;
    meals[1][2] = 'Pão com ovo mexido';
    ingredients[2][4] = 150; // ovo 100 → 150 g
    meals.push(['', 'Jantar', 'Atum com banana', 'PT', 'teste', 'Atum ao natural 100g; Banana 100g', 9999, 0, 0, 0, '']);

    const parsed = parseBankWorkbook(sheets);
    const matcher = buildFoodMatcher(FOODS);
    let plan = buildImportPlan({ parsed, bank: BANK, matcher, resolutions: {} });
    expect(plan.counts).toEqual({ nova: 1, atualizada: 1, sem_mudanca: 1, erro: 0 });
    expect(plan.pendingCount).toBe(1);
    const changed = plan.meals.find((m) => m.code === 'CM01')!;
    expect(changed.changes).toEqual(['nome', 'alimentos']);
    expect(changed.row.warnings[0]).toMatch(/Ingredientes/);
    const fresh = plan.meals.find((m) => m.status === 'nova')!;
    expect(fresh.code).toBe('JA01');
    expect(fresh.codeAssigned).toBe(true);
    expect(fresh.pendingFoods).toEqual(['Atum ao natural']);

    const key = unmatchedFoods(parsed, matcher)[0].key;
    plan = buildImportPlan({ parsed, bank: BANK, matcher, resolutions: { [key]: { kind: 'link', foodId: 'f-atum' } } });
    expect(plan.pendingCount).toBe(0);
    expect(plan.aliasesToSave).toEqual([{ alias: 'atum ao natural', food_id: 'f-atum' }]);
    expect(Math.round(plan.meals.find((m) => m.status === 'nova')!.totals.kcal)).toBe(193); // 104 + 89, não 9999
  });

  it('cria alimento com os valores da aba Alimentos', () => {
    const sheets: SheetInput[] = [
      { name: 'Refeições', rows: [['ID', 'Horário', 'Refeição', 'Origem', 'Tags', 'Alimentos (g)'], ['CE01', 'Ceia', 'Skyr', 'PT', '', 'Skyr natural 200g']] },
      { name: 'Alimentos', rows: [['Alimento', 'kcal/100g', 'Proteína/100g', 'Carbo/100g', 'Gordura/100g'], ['Skyr natural', 63, 11, 4, '0,2']] },
    ];
    const parsed = parseBankWorkbook(sheets);
    const matcher = buildFoodMatcher(FOODS);
    const [u] = unmatchedFoods(parsed, matcher);
    const plan = buildImportPlan({ parsed, bank: BANK, matcher, resolutions: { [u.key]: defaultResolution(u) } });
    expect(plan.pendingCount).toBe(0);
    expect(plan.foodsToCreate).toEqual([{ key: 'skyr natural', tempId: 'novo:skyr natural', name: 'Skyr natural', kcal: 63, p: 11, c: 4, g: 0.2 }]);
    expect(Math.round(plan.meals[0].totals.kcal)).toBe(126);
    expect(plan.meals[0].status).toBe('nova');
  });

  it('sem aba Alimentos o alimento novo fica pendente até preencher kcal/P/C/G', () => {
    const parsed = parseBankWorkbook([{ name: 'Refeições', rows: [['ID', 'Horário', 'Refeição', 'Origem', 'Tags', 'Alimentos (g)'], ['CE01', 'Ceia', 'Skyr', 'PT', '', 'Skyr natural 200g']] }]);
    const matcher = buildFoodMatcher(FOODS);
    const [u] = unmatchedFoods(parsed, matcher);
    expect(defaultResolution(u)).toBeUndefined();
    const half = buildImportPlan({ parsed, bank: BANK, matcher, resolutions: { [u.key]: { kind: 'create', name: 'Skyr natural', kcal: 63, p: null, c: 4, g: 0 } } });
    expect(half.pendingCount).toBe(1);
  });

  it('erros: horário inválido, refeição sem itens e gramas inválidas não entram', () => {
    const parsed = parseBankWorkbook([{ name: 'Refeições', rows: [
      ['ID', 'Horário', 'Refeição', 'Origem', 'Tags', 'Alimentos (g)'],
      ['X1', 'Brunch', 'A', 'BR', '', 'Ovo 100g'],
      ['X2', 'Jantar', 'B', 'BR', '', ''],
      ['X3', 'Jantar', 'C', 'BR', '', 'Ovo muito'],
      ['X4', 'Jantar', 'D', 'BRASIL', '', 'Ovo 100g'],
    ] }]);
    const plan = buildImportPlan({ parsed, bank: BANK, matcher: buildFoodMatcher(FOODS), resolutions: {} });
    expect(plan.counts.erro).toBe(4);
    expect(parsed.meals[0].errors[0]).toBe('Horário inválido: "Brunch".');
    expect(parsed.meals[1].errors).toContain('Refeição sem alimentos.');
    expect(parsed.meals[2].errors).toContain('Gramas inválidas em "Ovo muito".');
    expect(parsed.meals[3].errors[0]).toMatch(/Origem inválida/);
  });

  it('só desativa as que não estão no arquivo quando a opção é marcada', () => {
    const parsed = parseBankWorkbook([{ name: 'Refeições', rows: sheet(exported(), 'Refeições').rows.slice(0, 2) }]);
    const matcher = buildFoodMatcher(FOODS);
    expect(buildImportPlan({ parsed, bank: BANK, matcher, resolutions: {} }).toDeactivate).toEqual([]);
    expect(buildImportPlan({ parsed, bank: BANK, matcher, resolutions: {}, deactivateMissing: true }).toDeactivate.map((m) => m.code)).toEqual(['AL01']);
  });

  it('resumo final', () => {
    expect(importSummaryText({ novas: 12, atualizadas: 3, alimentosCriados: 2 })).toBe('12 novas, 3 atualizadas, 2 alimentos criados');
  });
});
