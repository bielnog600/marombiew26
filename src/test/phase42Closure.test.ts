import { describe, it, expect } from 'vitest';
import {
  validateCanonicalDietTarget,
  validateCanonicalDietDayTargets,
} from '@/lib/canonicalDietValidation';
import { OFFICIAL_MACRO_TOLERANCE } from '@/lib/macroTolerances';
import { DIET_MACRO_TOLERANCES } from '@/lib/dietMacroValidation';
import { DAY_TARGET_TOLERANCES } from '../../supabase/functions/_shared/dayTargets';
import { GLOBAL_TARGET_TOLERANCE } from '../../supabase/functions/_shared/globalDietTarget';
import { buildStructuredDietPrompt } from '@/lib/structuredDietPrompt';
import { extractModelDietFoodNames, buildAllowedUnresolvedFromModelDiet } from '@/lib/modelDietFoods';
import { foodRecordFromRow } from '@/lib/nutritionEngine';

const ID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ID_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const ID_FRANGO = 'cccccccc-3333-4333-8333-333333333333';

const rows = [
  { id: ID_A, name: 'Arroz branco', calories: 130, protein: 2.7, carbs: 28, fats: 0.3, portion: 'gramas', portion_size: 100 },
  { id: ID_B, name: 'Arroz branco', calories: 358, protein: 7.2, carbs: 78, fats: 0.6, portion: 'gramas', portion_size: 100 },
  { id: ID_FRANGO, name: 'Frango grelhado', calories: 165, protein: 31, carbs: 0, fats: 3.6, portion: 'gramas', portion_size: 100 },
];
const foods = rows.map((r) => foodRecordFromRow(r as any));

const planWith = (items: any[], weekday = 'seg') => ({
  days: [{ weekday, label: 'Segunda', meals: [{ name: 'Almoço', time: '12:00', items }] }],
});

describe('Fase 4.2 — fechamento', () => {
  it('A: homônimo resolve pelo foodId correto (130 kcal, nunca 358)', () => {
    const report = validateCanonicalDietTarget({
      plan: planWith([{ foodId: ID_A, name: 'Arroz branco', qtyGrams: 100 }]),
      target: { calories: 130, protein: 3, carbs: 28, fats: 0 },
      foods,
    });
    expect(report.generated.calories).toBe(130);
    expect(report.generated.calories).not.toBe(358);
    expect(report.unmatchedFoods).toHaveLength(0);
    expect(report.valid).toBe(true);
  });

  it('B: validação global structured ignora macros da IA e não usa markdown', () => {
    const report = validateCanonicalDietTarget({
      plan: planWith([
        { foodId: ID_FRANGO, name: 'X inventado', qtyGrams: 200, macros: { kcal: 9999, p: 999, c: 999, g: 999 } },
      ]),
      target: { calories: 330, protein: 62, carbs: 0, fats: 7 },
      foods,
    });
    expect(report.generated.calories).toBe(330);
    expect(report.valid).toBe(true);
  });

  it('B2: item sem foodId não resolve por nome (strict_id)', () => {
    const report = validateCanonicalDietTarget({
      plan: planWith([{ foodId: null, name: 'Frango grelhado', qtyGrams: 200 }]),
      target: { calories: 330, protein: 62, carbs: 0, fats: 7 },
      foods,
    });
    expect(report.generated.calories).toBe(0);
    expect(report.unmatchedFoods).toContain('Frango grelhado');
    expect(report.valid).toBe(false);
  });

  it('C: carb cycling structured valida por weekday usando foodId', () => {
    const plan = {
      days: [
        { weekday: 'seg', meals: [{ name: 'Almoço', items: [{ foodId: ID_A, name: 'Arroz branco', qtyGrams: 100 }] }] },
        { weekday: 'ter', meals: [{ name: 'Almoço', items: [{ foodId: ID_B, name: 'Arroz branco', qtyGrams: 100 }] }] },
      ],
    };
    const report = validateCanonicalDietDayTargets({
      plan,
      dayTargets: {
        seg: { kcal: 130, p: 3, c: 28, g: 0, type: 'low' } as any,
        ter: { kcal: 358, p: 7, c: 78, g: 1, type: 'high' } as any,
      },
      foods,
    });
    expect(report.valid).toBe(true);
    expect(report.days.seg?.generated.kcal).toBe(130);
    expect(report.days.ter?.generated.kcal).toBe(358);
  });

  it('D: dia com meta e sem cardápio entra em missingDays', () => {
    const report = validateCanonicalDietDayTargets({
      plan: planWith([{ foodId: ID_A, name: 'Arroz branco', qtyGrams: 100 }]),
      dayTargets: { seg: { kcal: 130, p: 3, c: 28, g: 0 } as any, ter: { kcal: 200, p: 5, c: 40, g: 1 } as any },
      foods,
    });
    expect(report.missingDays).toContain('ter');
    expect(report.valid).toBe(false);
  });

  it('H: tolerâncias structured são ±50/±10/±15/±8 e vêm de uma fonte única', () => {
    expect(OFFICIAL_MACRO_TOLERANCE).toEqual({ kcal: 50, p: 10, c: 15, g: 8 });
    expect(GLOBAL_TARGET_TOLERANCE).toBe(OFFICIAL_MACRO_TOLERANCE);
    expect(DAY_TARGET_TOLERANCES).toBe(OFFICIAL_MACRO_TOLERANCE);
    expect(DIET_MACRO_TOLERANCES).toEqual({ calories: 50, protein: 10, carbs: 15, fats: 8 });
    const report = validateCanonicalDietTarget({
      plan: planWith([{ foodId: ID_A, name: 'Arroz branco', qtyGrams: 100 }]),
      target: { calories: 179, protein: 3, carbs: 28, fats: 0 },
      foods,
    });
    expect(report.valid).toBe(true); // 49 kcal de diferença
    const failing = validateCanonicalDietTarget({
      plan: planWith([{ foodId: ID_A, name: 'Arroz branco', qtyGrams: 100 }]),
      target: { calories: 181, protein: 3, carbs: 28, fats: 0 },
      foods,
    });
    expect(failing.valid).toBe(false);
  });

  it('I/J: prompt structured preserva dieta modelo e não pede macros', () => {
    const prompt = buildStructuredDietPrompt({
      studentContext: 'Aluno teste',
      routine: 'Treina à noite',
      meals: 'Número de refeições: 4',
      targets: 'Calorias alvo: 2000 kcal',
      modelDiet: '* Arroz branco: 100 g',
      allowedUnresolved: ['Pão da padaria'],
    });
    expect(prompt).toContain('DIETA MODELO');
    expect(prompt).toContain('MESMA ordem');
    expect(prompt).toContain('Pão da padaria');
    expect(prompt).toMatch(/NUNCA informe calorias/);
    expect(prompt).not.toMatch(/Kcal \| P \| C \| G/i);
    expect(prompt).not.toMatch(/devolva kcal/i);
    expect(prompt).not.toMatch(/preencha sempre kcal/i);
    expect(prompt).not.toMatch(/total di[áa]rio no final/i);
  });

  it('K: cabeçalho e separador de tabela não viram alimento autorizado', () => {
    const names = extractModelDietFoodNames(
      ['| Alimento | Quantidade |', '|---|---|', '| Arroz branco | 100 g |'].join('\n'),
    );
    expect(names.some((n) => /alimento|quantidade/i.test(n))).toBe(false);
    expect(names.some((n) => /arroz/i.test(n))).toBe(true);
  });

  it('L: bullet narrativo não vira alimento autorizado', () => {
    const names = extractModelDietFoodNames(
      [
        '- Importante: aluno treina à noite',
        '- Observação: prefere refeições rápidas',
        '* Pão da padaria: 80 g',
      ].join('\n'),
    );
    expect(names.some((n) => /treina|prefere/i.test(n))).toBe(false);
    expect(names.some((n) => /p[ãa]o/i.test(n))).toBe(true);
    const allowed = buildAllowedUnresolvedFromModelDiet(
      ['| Alimento | Quantidade |', '|---|---|', '- Importante: aluno treina à noite', '* Pão da padaria: 80 g'].join('\n'),
      rows as any,
    );
    expect(allowed.map((a) => a.name.toLowerCase()).some((n) => n.includes('pão'))).toBe(true);
    expect(allowed.length).toBe(1);
  });
});
