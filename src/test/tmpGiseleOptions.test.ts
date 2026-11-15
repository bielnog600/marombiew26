import { it } from 'vitest';
import fs from 'fs';
import { generatePlanMealOptions, buildStudentMealContext, sumOptionItems } from '@/lib/mealBank';
it('gisele', () => {
  const bankRaw = JSON.parse(fs.readFileSync('/tmp/mealbank/bank.json', 'utf8'))[0].json_agg;
  const plan = JSON.parse(fs.readFileSync('/tmp/mealbank/gisele_plan.json', 'utf8'))[0].conteudo_json;
  const q = JSON.parse(fs.readFileSync('/tmp/mealbank/gisele_q.json', 'utf8'))[0];
  const foods = JSON.parse(fs.readFileSync('/tmp/mealbank/allfoods.json', 'utf8'));
  console.log('foods', foods.length);
  const bank = bankRaw.map((m: any) => ({ ...m, items: m.items.map((i: any) => ({ ...i, grams: Number(i.grams) })) }));
  const ctx = buildStudentMealContext({ phone: '351911577317', restricoes: [q.restricoes_alimentares], preferencias: [q.preferencias_alimentares], alimentos: q.alimentos_por_refeicao });
  console.log('flags', [...ctx.restrictions], ctx.dislikes, ctx.origins);
  const res = generatePlanMealOptions(plan, bank, foods, ctx);
  const out: string[] = [];
  for (const m of res.plan.days[0].meals) {
    const o1 = sumOptionItems(m.items).kcal;
    out.push(`## ${m.name} ${m.time} opt1=${Math.round(o1)} :: ${m.items.map((i: any) => `${i.name} ${i.qtyGrams}`).join('; ')}`);
    for (const o of m.options ?? []) {
      const k = sumOptionItems(o.items);
      out.push(`  [${o.source}${o.bankCode ? ' ' + o.bankCode : ''}] ${o.name} kcal=${Math.round(k.kcal)} (${Math.round((k.kcal / o1 - 1) * 100)}%) P${Math.round(k.p)} C${Math.round(k.c)} G${Math.round(k.g)} :: ${o.items.map((i: any) => `${i.name} ${i.qtyGrams}`).join('; ')}`);
    }
  }
  console.log(out.join('\n'), res.skipped);
});
