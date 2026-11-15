import { it } from 'vitest';
import { parseDietPlanLoose } from '@/lib/dietSchema';
it('x', () => {
  const item = (name: string, grams: number, m: any, foodId?: string) => ({ foodId, name, qtyGrams: grams, portionLabel: `${grams} g`, macros: m });
  const plan = { meta: { foodContractVersion: '1' }, targets: { kcal: 466, p: 10, c: 100, g: 2.9 }, days: [{ label: 'Padrão', totals: { kcal: 466, p: 10, c: 100, g: 2.9 }, meals: [{ id: 'm1', order: 1, name: 'Jantar', time: '20:00', totals: {kcal:1,p:1,c:1,g:1}, items: [item('Arroz', 200, {kcal:1,p:1,c:1,g:1}, 'arroz')] }] }] };
  console.log(JSON.stringify(parseDietPlanLoose(plan))?.slice(0, 300));
  const r = (require('@/lib/dietSchema') as any);
  console.log(Object.keys(r).filter(k => /schema|Schema/.test(k)));
});
