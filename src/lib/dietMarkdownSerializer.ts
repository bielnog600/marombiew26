import type { ParsedFood, ParsedMeal } from './dietResultParser';

const num = (v?: string) => {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number) => {
  if (!Number.isFinite(v) || v <= 0) return '0';
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const stripG = (qty: string) => String(qty || '').replace(/\s*g\s*$/i, '').trim();

/**
 * Build a single combined markdown table containing all meals.
 * Format matches the "big meal table" the parser already understands:
 * | Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G |
 */
export const buildMealTableMarkdown = (meals: ParsedMeal[]): string => {
  const header = '| Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G |';
  const sep    = '|----------|---------|----------|------------|------|---|---|---|';
  const rows: string[] = [header, sep];

  let dayKcal = 0, dayP = 0, dayC = 0, dayG = 0;

  for (const meal of meals) {
    let mealKcal = 0, mealP = 0, mealC = 0, mealG = 0;
    meal.foods.forEach((food, idx) => {
      const mealCell = idx === 0 ? meal.name : '-';
      const timeCell = idx === 0 ? (meal.time || '-') : '-';
      const qty = stripG(food.qty || '');
      rows.push(
        `| ${mealCell} | ${timeCell} | ${food.food} | ${qty ? `${qty} g` : '-'} | ${num(food.kcal) || '-'} | ${num(food.p) || '-'} | ${num(food.c) || '-'} | ${num(food.g) || '-'} |`,
      );
      mealKcal += num(food.kcal);
      mealP += num(food.p);
      mealC += num(food.c);
      mealG += num(food.g);
    });
    rows.push(`| **Total ${meal.name}** | - | - | - | ${fmt(mealKcal)} | ${fmt(mealP)} | ${fmt(mealC)} | ${fmt(mealG)} |`);
    dayKcal += mealKcal; dayP += mealP; dayC += mealC; dayG += mealG;
  }

  rows.push(`| **TOTAL DIA** | - | - | - | ${fmt(dayKcal)} | ${fmt(dayP)} | ${fmt(dayC)} | ${fmt(dayG)} |`);
  return rows.join('\n');
};

/**
 * Replace the first "big meal table" block in the markdown with a freshly
 * built table from the edited meals. The intro/text, tips and other sections
 * around the table are preserved.
 *
 * If no big meal table is found, the new table is appended to the end.
 */
export const replaceMealTableInMarkdown = (markdown: string, meals: ParsedMeal[]): string => {
  const newTable = buildMealTableMarkdown(meals);
  const lines = markdown.split('\n');

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim().toLowerCase();
    if (!l.startsWith('|')) continue;
    if (l.includes('refei') && (l.includes('alimento') || l.includes('kcal') || l.includes('proteí') || l.includes('quantidade'))) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    return `${markdown.trimEnd()}\n\n${newTable}\n`;
  }

  let endIdx = startIdx;
  while (endIdx < lines.length && (lines[endIdx].trim().startsWith('|') || lines[endIdx].trim() === '')) {
    endIdx++;
  }

  return [...lines.slice(0, startIdx), newTable, ...lines.slice(endIdx)].join('\n');
};

export const computeDayTotals = (meals: ParsedMeal[]) => {
  let kcal = 0, p = 0, c = 0, g = 0;
  for (const m of meals) {
    for (const f of m.foods) {
      kcal += num(f.kcal);
      p += num(f.p);
      c += num(f.c);
      g += num(f.g);
    }
  }
  return { kcal, p, c, g };
};

/**
 * Proportionally scale every food's quantity & macros so the total kcal matches
 * the target. Returns a new meals array.
 */
export const scaleMealsToTarget = (meals: ParsedMeal[], targetKcal: number): ParsedMeal[] => {
  const totals = computeDayTotals(meals);
  if (totals.kcal <= 0 || targetKcal <= 0) return meals;
  const factor = targetKcal / totals.kcal;

  return meals.map((meal) => ({
    ...meal,
    foods: meal.foods.map<ParsedFood>((food) => {
      const qtyN = num(stripG(food.qty));
      return {
        ...food,
        qty: qtyN > 0 ? `${fmt(qtyN * factor)} g` : food.qty,
        kcal: fmt(num(food.kcal) * factor),
        p: fmt(num(food.p) * factor),
        c: fmt(num(food.c) * factor),
        g: fmt(num(food.g) * factor),
      };
    }),
  }));
};