/**
 * MICRO-HOTFIX — uma cadeia de versões (V1 → V2 → V3 → rascunho V4) é UMA
 * dieta na tela. O agrupamento usa exclusivamente id/parent_plan_id, nunca
 * título ou data.
 */
export { normalizeDietTitle } from '../../supabase/functions/_shared/dietTitle';
import { normalizeDietTitle } from '../../supabase/functions/_shared/dietTitle';

export interface DietPlanRow {
  id: string;
  parent_plan_id?: string | null;
  version?: number | null;
  is_draft?: boolean | null;
  titulo?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  [key: string]: any;
}

export interface DietVersionChain<T extends DietPlanRow = DietPlanRow> {
  rootId: string;
  title: string;
  /** Todas as versões, da mais nova para a mais antiga. */
  versions: T[];
  latestPublished: T | null;
  latestDraft: T | null;
  /** Card principal: o rascunho atual quando existe; senão a última publicada. */
  head: T;
}

const versionOf = (p: DietPlanRow) => Number(p?.version ?? 1) || 1;

const timeOf = (p: DietPlanRow) =>
  new Date(p?.published_at ?? p?.created_at ?? 0).getTime() || 0;

const rootIdOf = (plan: DietPlanRow, byId: Map<string, DietPlanRow>): string => {
  let current = plan;
  const seen = new Set<string>([current.id]);
  while (current.parent_plan_id && byId.has(String(current.parent_plan_id))) {
    const parent = byId.get(String(current.parent_plan_id))!;
    if (seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
};

export function groupDietVersionChains<T extends DietPlanRow>(plans: T[]): DietVersionChain<T>[] {
  const list = (plans ?? []).filter((p) => p && p.id);
  const byId = new Map<string, T>(list.map((p) => [String(p.id), p]));
  const chains = new Map<string, T[]>();

  for (const plan of list) {
    const root = rootIdOf(plan, byId as Map<string, DietPlanRow>);
    const bucket = chains.get(root);
    if (bucket) bucket.push(plan);
    else chains.set(root, [plan]);
  }

  const out: DietVersionChain<T>[] = [];
  chains.forEach((versions, rootId) => {
    const sorted = [...versions].sort(
      (a, b) => versionOf(b) - versionOf(a) || timeOf(b) - timeOf(a),
    );
    const published = sorted.filter((p) => p.is_draft === false);
    const drafts = sorted.filter((p) => p.is_draft !== false);
    const latestPublished = published[0] ?? null;
    const latestDraft = drafts[0] ?? null;
    const head = latestDraft ?? latestPublished ?? sorted[0];
    out.push({
      rootId,
      title: normalizeDietTitle(head?.titulo) || 'Dieta',
      versions: sorted,
      latestPublished,
      latestDraft,
      head,
    });
  });

  return out.sort((a, b) => timeOf(b.head) - timeOf(a.head));
}
