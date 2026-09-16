import { describe, expect, it } from 'vitest';
import {
  buildStructuredDisplayGroups,
  canonicalDayToStudentMeals,
  getPublishedDayTarget,
  getStructuredDayDisplay,
  getStructuredDietDay,
  isStructuredPublishedDiet,
  STUDENT_WEEKDAY_KEYS,
  todayWeekdayIndex,
} from '@/lib/studentStructuredDiet';

const REAL = {
  seg: { kcal: 1785, p: 148.9, c: 135.4, g: 73.9 },
  ter: { kcal: 1919, p: 148.5, c: 168.6, g: 75.4 },
  qua: { kcal: 1622, p: 145.9, c: 92.2, g: 76 },
  qui: { kcal: 1919, p: 148.5, c: 168.6, g: 75.4 },
  sex: { kcal: 1619, p: 145.2, c: 93, g: 75.6 },
  sab: { kcal: 1632, p: 145.5, c: 95.6, g: 75.7 },
  dom: { kcal: 1743, p: 144.6, c: 132.2, g: 73.6 },
} as const;

const LABELS: Record<string, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta',
  sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};

const plan = {
  meta: { foodContractVersion: 1 },
  days: STUDENT_WEEKDAY_KEYS.map((w) => ({
    weekday: w,
    label: LABELS[w],
    totals: REAL[w],
    meals: [
      {
        id: 'm1',
        name: 'Café da Manhã',
        time: '07:00',
        totals: REAL[w],
        items: [
          {
            name: 'Iogurte Skyr Natural',
            foodId: '3331d18c-eb7e-489f-9971-29e4626e56b4',
            qtyGrams: w === 'ter' ? 170 : 120,
            portionLabel: `${w === 'ter' ? 170 : 120} g`,
            resolutionStatus: 'snapshot',
            macros: { kcal: REAL[w].kcal, p: REAL[w].p, c: REAL[w].c, g: REAL[w].g },
            nutritionSnapshot: { kcal: 59, p: 10, c: 4, g: 0.2, portionSize: 100, version: '1.0' },
          },
        ],
      },
    ],
  })),
};

const protocols = {
  weekly_day_targets: {
    seg: { kcal: 1742, p: 148, c: 121, g: 74, type: 'medium' },
    ter: { kcal: 1930, p: 148, c: 168, g: 74, type: 'high' },
    qua: { kcal: 1634, p: 148, c: 94, g: 74, type: 'low' },
    qui: { kcal: 1930, p: 148, c: 168, g: 74, type: 'high' },
    sex: { kcal: 1634, p: 148, c: 94, g: 74, type: 'low' },
    sab: { kcal: 1634, p: 148, c: 94, g: 74, type: 'low' },
    dom: { kcal: 1742, p: 148, c: 121, g: 74, type: 'medium' },
  },
  weekly_energy_schedule: { base_daily_kcal: 1740, days: {} },
};

describe('HOTFIX ALUNO — dieta structured publicada', () => {
  it('A — cada weekday devolve as calorias REAIS do dia publicado', () => {
    const groups = buildStructuredDisplayGroups(plan, protocols);
    expect(groups).toHaveLength(7);
    groups.forEach((g) => expect(g.totals.kcal).toBe(REAL[g.weekday].kcal));
  });

  it('B — terça (HIGH) nunca devolve 1740', () => {
    expect(getStructuredDayDisplay(plan, protocols, 'ter')!.totals.kcal).toBe(1919);
  });

  it('C — quarta (LOW) nunca devolve 1740', () => {
    expect(getStructuredDayDisplay(plan, protocols, 'qua')!.totals.kcal).toBe(1622);
  });

  it('D — meta teórica vem de weekly_day_targets sem mudar o prescrito', () => {
    const ter = getStructuredDayDisplay(plan, protocols, 'ter')!;
    expect(ter.target!.kcal).toBe(1930);
    expect(ter.totals.kcal).toBe(1919);
  });

  it('E — nenhum scaling proporcional é aplicado (qtyGrams preservado)', () => {
    const meals = getStructuredDayDisplay(plan, protocols, 'ter')!.meals;
    expect(meals[0].foods[0].qty).toBe('170 g');
  });

  it('F — item.macros é usado na UI', () => {
    const food = canonicalDayToStudentMeals(getStructuredDietDay(plan, 'ter'))[0].foods[0];
    expect(Number(food.kcal)).toBe(1919);
  });

  it('G — nutritionSnapshot nunca é confundido com a porção atual', () => {
    const food = canonicalDayToStudentMeals(getStructuredDietDay(plan, 'seg'))[0].foods[0];
    expect(Number(food.kcal)).not.toBe(59);
  });

  it('H — o rótulo usa o tipo de weekly_day_targets', () => {
    const groups = buildStructuredDisplayGroups(plan, protocols);
    expect(groups.map((g) => g.tag)).toEqual(['MEDIUM', 'HIGH', 'LOW', 'HIGH', 'LOW', 'LOW', 'MEDIUM']);
  });

  it('I — sem weekly_day_targets não há meta (nunca base_daily_kcal)', () => {
    const g = getStructuredDayDisplay(plan, { weekly_energy_schedule: { base_daily_kcal: 1740 } }, 'ter')!;
    expect(g.target).toBeNull();
    expect(g.totals.kcal).toBe(1919);
  });

  it('J — legacy (sem contrato e sem foodId) não é tratado como structured', () => {
    const legacy = { days: [{ weekday: 'seg', meals: [{ items: [{ name: 'Arroz', qtyGrams: 100 }] }] }] };
    expect(buildStructuredDisplayGroups(legacy, protocols)).toHaveLength(0);
    expect(isStructuredPublishedDiet(legacy, false)).toBe(false);
  });

  it('K — rascunho nunca é exibido como publicado', () => {
    expect(isStructuredPublishedDiet(plan, true)).toBe(false);
    expect(isStructuredPublishedDiet(plan, false)).toBe(true);
  });

  it('L — o weekday de hoje é 0=Seg .. 6=Dom', () => {
    expect(todayWeekdayIndex(new Date('2026-01-05T12:00:00'))).toBe(0); // segunda
    expect(todayWeekdayIndex(new Date('2026-01-11T12:00:00'))).toBe(6); // domingo
  });

  it('M — a Home seleciona o dia de hoje e não soma os 7 dias', () => {
    const key = STUDENT_WEEKDAY_KEYS[todayWeekdayIndex(new Date('2026-01-06T12:00:00'))];
    const today = getStructuredDayDisplay(plan, protocols, key)!;
    expect(today.totals.kcal).toBe(1919);
    const weekSum = Object.values(REAL).reduce((s, d) => s + d.kcal, 0);
    expect(today.totals.kcal).toBeLessThan(weekSum);
  });

  it('N — aliases de weekday (monday/Segunda) resolvem o mesmo dia', () => {
    expect(getStructuredDietDay(plan, 'monday')).toBe(getStructuredDietDay(plan, 'seg'));
    expect(getStructuredDietDay(plan, 'Terça-feira')).toBe(getStructuredDietDay(plan, 'ter'));
  });

  it('O — meta inválida (kcal 0/ausente) devolve null', () => {
    expect(getPublishedDayTarget({ weekly_day_targets: { ter: { kcal: 0 } } }, 'ter')).toBeNull();
    expect(getPublishedDayTarget(null, 'ter')).toBeNull();
  });
});
