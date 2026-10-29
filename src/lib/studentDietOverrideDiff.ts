/**
 * Comparação pura entre a refeição prescrita pelo treinador e a versão
 * atual do aluno (sobreposição salva em student_diet_overrides.groups).
 */
export interface OverrideFood { name?: string; qty?: string; kcal?: string; p?: string; c?: string; g?: string; [k: string]: any }
export interface OverrideMeal { name?: string; time?: string; foods?: OverrideFood[]; [k: string]: any }

export type FoodChangeKind = 'same' | 'qty' | 'replaced' | 'added' | 'removed';
export interface FoodChange { kind: FoodChangeKind; before?: OverrideFood; after?: OverrideFood }
export interface MealDiff { name: string; time?: string; changes: FoodChange[]; changed: boolean }
export interface Totals { kcal: number; p: number; c: number; g: number }

const num = (v?: string) => {
  const n = Number(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const norm = (s?: string) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** Nome do alimento tolerante a formatos antigos/novos (food/name/nome/alimento). */
export const foodName = (f?: OverrideFood | null): string =>
  String(f?.food ?? f?.name ?? f?.nome ?? f?.alimento ?? '').trim();
const sameQty = (a?: string, b?: string) => norm(a).replace(/\s+/g, '') === norm(b).replace(/\s+/g, '');

export const sumMeals = (meals: OverrideMeal[]): Totals =>
  (meals ?? []).reduce<Totals>((acc, m) => {
    (m?.foods ?? []).forEach((f) => {
      acc.kcal += num(f.kcal); acc.p += num(f.p); acc.c += num(f.c); acc.g += num(f.g);
    });
    return acc;
  }, { kcal: 0, p: 0, c: 0, g: 0 });

export function diffMealFoods(before: OverrideFood[] = [], after: OverrideFood[] = []): FoodChange[] {
  const out: FoodChange[] = [];
  const used = new Set<number>();
  const matchedBefore = new Map<number, number>();
  before.forEach((b, bi) => {
    const ai = after.findIndex((a, i) => !used.has(i) && norm(foodName(a)) === norm(foodName(b)));
    if (ai >= 0) { used.add(ai); matchedBefore.set(bi, ai); }
  });
  const unmatchedAfter = after.map((_, i) => i).filter((i) => !used.has(i));
  before.forEach((b, bi) => {
    const ai = matchedBefore.get(bi);
    if (ai != null) {
      const a = after[ai];
      out.push({ kind: sameQty(a.qty, b.qty) ? 'same' : 'qty', before: b, after: a });
    } else if (unmatchedAfter.length > 0) {
      const a = after[unmatchedAfter.shift()!];
      out.push({ kind: 'replaced', before: b, after: a });
    } else {
      out.push({ kind: 'removed', before: b });
    }
  });
  unmatchedAfter.forEach((i) => out.push({ kind: 'added', after: after[i] }));
  return out;
}

export function diffDay(prescribed: OverrideMeal[] = [], student: OverrideMeal[] = []): MealDiff[] {
  const len = Math.max(prescribed.length, student.length);
  const out: MealDiff[] = [];
  for (let i = 0; i < len; i++) {
    const p = prescribed[i]; const s = student[i];
    const changes = diffMealFoods(p?.foods ?? [], s?.foods ?? []);
    out.push({
      name: String(s?.name ?? p?.name ?? `Refeição ${i + 1}`),
      time: s?.time ?? p?.time,
      changes,
      changed: changes.some((c) => c.kind !== 'same'),
    });
  }
  return out;
}

export const hasOverrideGroups = (groups: unknown): boolean =>
  !!groups && typeof groups === 'object' && Object.keys(groups as object).length > 0;

/** Linhas legíveis descrevendo o que mudou entre dois snapshots de groups. */
export function summarizeGroupChanges(prev: Record<string, any> | null | undefined, next: Record<string, any> | null | undefined): string[] {
  const WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const out: string[] = [];
  const keys = Object.keys(next ?? {}).sort((a, b) => Number(a) - Number(b));
  keys.forEach((k) => {
    const g = next?.[k] ?? {};
    const base: OverrideMeal[] = prev?.[k]?.student ?? g.prescribed ?? [];
    const day = g.label || WEEK[Number(k)] || `Dia ${Number(k) + 1}`;
    diffDay(base, g.student ?? []).forEach((m) => {
      m.changes.forEach((c) => {
        const b = foodName(c.before); const a = foodName(c.after);
        let t = '';
        if (c.kind === 'qty') t = `porção de ${b} ${c.before?.qty || '—'} → ${c.after?.qty || '—'}`;
        else if (c.kind === 'replaced') t = `trocou ${b} por ${a}`;
        else if (c.kind === 'added') t = `adicionou ${a}${c.after?.qty ? ` (${c.after.qty})` : ''}`;
        else if (c.kind === 'removed') t = `removeu ${b}`;
        if (t) out.push(`${day} · ${m.name}: ${t}`);
      });
    });
  });
  return out;
}
