/**
 * Builds an executable set plan from a composed prescription.
 *
 * Inputs:
 *  - series:  primary count (e.g. "3" or "1" for recognition sets)
 *  - series2: secondary count (when present, indicates work sets after recognition)
 *  - reps:    may be a single value ("8-10"), a composed value ("12+8-10" / "12 + 8")
 *
 * Output: a flat array of planned sets, each with type and reps label.
 */
export type PlannedSetType = 'recognition' | 'work';

export interface PlannedSet {
  type: PlannedSetType;
  reps: string; // raw reps text for that set (e.g. "12" or "8-10")
}

const toInt = (v?: string | null): number => {
  if (!v) return 0;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
};

const isReal = (v?: string | null) => {
  if (!v) return false;
  const t = String(v).trim();
  return t.length > 0 && !['-', '—', '–', 'n/a', 'na'].includes(t.toLowerCase());
};

/** Splits a composed reps string like "12 + 8-10" into ["12", "8-10"]. Returns single-element array if no '+'. */
export const splitComposedReps = (reps?: string | null): string[] => {
  if (!isReal(reps)) return [''];
  return String(reps)
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
};

export const buildSetPlan = (
  series?: string | null,
  series2?: string | null,
  reps?: string | null,
): PlannedSet[] => {
  const s1 = toInt(series);
  const s2 = toInt(series2);
  const repParts = splitComposedReps(reps);

  // Composed prescription: recognition (s1) + work (s2)
  if (s1 > 0 && s2 > 0) {
    const recReps = repParts[0] || '';
    const workReps = repParts[1] || repParts[0] || '';
    const plan: PlannedSet[] = [];
    for (let i = 0; i < s1; i++) plan.push({ type: 'recognition', reps: recReps });
    for (let i = 0; i < s2; i++) plan.push({ type: 'work', reps: workReps });
    return plan;
  }

  // Single block — all work sets
  const total = s1 || s2 || 3;
  const r = repParts[0] || '';
  return Array.from({ length: total }, () => ({ type: 'work' as const, reps: r }));
};

/** Human-readable summary like "1x12 + 3x8–10" or "3x8–10". */
export const buildPlanSummary = (plan: PlannedSet[]): string => {
  if (plan.length === 0) return '';
  // Group consecutive identical (type+reps) blocks
  const blocks: { count: number; reps: string }[] = [];
  for (const set of plan) {
    const last = blocks[blocks.length - 1];
    if (last && last.reps === set.reps) {
      last.count += 1;
    } else {
      blocks.push({ count: 1, reps: set.reps });
    }
  }
  return blocks
    .map((b) => `${b.count}x${(b.reps || '?').replace('-', '–')}`)
    .join(' + ');
};
