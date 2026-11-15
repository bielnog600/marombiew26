import { it } from 'vitest';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { foodRecordFromRow } from '@/lib/nutritionEngine';
import { buildBankExportSheets, buildFoodMatcher, buildImportPlan, parseBankWorkbook, unmatchedFoods, suggestFoods } from '@/lib/mealBank/spreadsheet';

const bank = JSON.parse(fs.readFileSync('/tmp/mealbank/bank.json', 'utf8'))[0].json_agg;
const foods = JSON.parse(fs.readFileSync('/tmp/mealbank/allfoods.json', 'utf8')).map((r: any) => foodRecordFromRow(r));
const readSheets = (path: string) => {
  const wb = XLSX.read(fs.readFileSync(path), { type: 'buffer' });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }) }));
};
it('real', () => {
  const mode = process.env.MB_MODE;
  if (mode === 'export') {
    const wb = XLSX.utils.book_new();
    for (const s of buildBankExportSheets(bank, foods)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows as unknown[][]), s.name);
    XLSX.writeFile(wb, '/tmp/mealbank/xl/export.xlsx');
  }
  const file = mode === 'export' ? '/tmp/mealbank/xl/export.xlsx' : '/tmp/mealbank/xl/edited.xlsx';
  const parsed = parseBankWorkbook(readSheets(file));
  const matcher = buildFoodMatcher(foods);
  const plan = buildImportPlan({ parsed, bank, matcher, resolutions: {} });
  const un = unmatchedFoods(parsed, matcher);
  console.log(JSON.stringify({ file, counts: plan.counts, pending: plan.pendingCount, fileErrors: parsed.fileErrors,
    unmatched: un.map((u) => ({ name: u.name, usedIn: u.usedIn, sug: suggestFoods(u.name, foods).map((f) => f.name) })),
    changed: plan.meals.filter((m) => m.status !== 'sem_mudanca').map((m) => ({ code: m.code, st: m.status, ch: m.changes, kcal: Math.round(m.totals.kcal), err: m.row.errors, warn: m.row.warnings, items: m.items.map((i) => `${i.name} ${i.grams}${i.foodId ? '' : ' (?)'}`) })) }, null, 1));
});
