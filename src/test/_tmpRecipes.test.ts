import { it } from 'vitest';
import fs from 'fs';
import { buildFoodIndex, foodRecordFromRow } from '@/lib/nutritionEngine';
import { buildStudentMealContext, mealSlotsFor, mealTargetMacros, countryFromPhone } from '@/lib/mealBank';
import { autoBankOptionsForWeek, studentRecipesFor, defaultRecipeFilters } from '@/lib/mealBank/studentRecipes';
import { canonicalDayFor } from '@/lib/studentStructuredDiet';

const bank = JSON.parse(fs.readFileSync('/tmp/rec/bank.json', 'utf8')).map((r: any) => ({ ...r, active: r.active !== false, tags: r.tags ?? [], items: (r.items ?? []).map((i: any) => ({ foodId: i.foodId, grams: Number(i.grams), ordem: i.ordem })) }));
const foods = JSON.parse(fs.readFileSync('/tmp/rec/foods.json', 'utf8')).map(foodRecordFromRow);
const index = buildFoodIndex(foods);
for (const [u, phone] of [['50d7546f-e9c4-404b-a63a-7708e536ecd8', '351911577317'], ['0feb5458-15cb-490a-9341-90bd57795495', '351939345414']]) {
  it(u, () => {
    const plan = JSON.parse(fs.readFileSync(`/tmp/rec/plan-${u}.json`, 'utf8'))[0];
    const c = JSON.parse(fs.readFileSync(`/tmp/rec/ctx-${u}.json`, 'utf8'))[0];
    const q = c.q ?? {};
    const ctx = buildStudentMealContext({ phone, restricoes: [c.r, q.restricoes_alimentares], preferencias: [q.preferencias_alimentares], alimentos: q.alimentos_por_refeicao });
    const cj = plan.conteudo_json;
    const weekDays = [0,1,2,3,4,5,6].map((wi) => canonicalDayFor(cj, wi)?.meals ?? null);
    const t0 = performance.now();
    const auto = autoBankOptionsForWeek({ planId: plan.id, weekDays, bank, index, ctx });
    const t1 = performance.now();
    console.log(u, 'auto ms', Math.round(t1 - t0));
    auto.forEach((d, wi) => console.log(wi, d.map((o, mi) => `${weekDays[wi]![mi].name}=${o ? o.bankCode + ' ' + o.name : '—'}`).join(' | ')));
    const auto2 = autoBankOptionsForWeek({ planId: plan.id, weekDays, bank, index, ctx });
    console.log('deterministic', JSON.stringify(auto) === JSON.stringify(auto2));
    const t2 = performance.now();
    const day = weekDays[0]!;
    for (const m of day) {
      const r = studentRecipesFor({ bank, index, ctx, slots: mealSlotsFor(m.name, m.time), target: mealTargetMacros(m), filters: defaultRecipeFilters(countryFromPhone(phone)), excludeCodes: [] });
      const t = mealTargetMacros(m);
      console.log(`  ${m.name} meta ${Math.round(t.kcal)} P${Math.round(t.p!)} C${Math.round(t.c!)} G${Math.round(t.g!)}: ${r.filter(x=>x.ok).length}/${r.length} batem —`, r.slice(0, 4).map((x) => `${x.meal.code}${x.ok ? '✓' : '✗'} ${Math.round(x.totals.kcal)} [${x.fit.option.items.map(i=>`${i.name} ${i.qtyGrams}`).join(', ')}]`).join(' ; '));
    }
    console.log('recipes ms', Math.round(performance.now() - t2));
  });
}
