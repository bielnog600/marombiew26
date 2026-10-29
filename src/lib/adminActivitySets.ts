export function activitySetDisplay(set: { completed?: boolean; weight?: unknown; reps?: unknown; rpe?: unknown; rir?: unknown } | undefined, target: unknown) {
  const done = set?.completed === true;
  return {
    done,
    weight: done && set.weight != null && set.weight !== '' ? `${String(set.weight).replace('.', ',')} kg` : '—',
    reps: done && set.reps != null && set.reps !== '' ? String(set.reps) : '—',
    target: !done && target != null && target !== '' ? String(target) : null,
    effort: done ? set.rpe ? `RPE ${set.rpe}` : set.rir != null && set.rir !== '' ? `RIR ${set.rir}` : '' : '',
  };
}

export const activityRepLabel = (reps: unknown) => /(?:\d\s*s\b|seg|min|:)/i.test(String(reps)) ? String(reps) : `${reps} reps`;