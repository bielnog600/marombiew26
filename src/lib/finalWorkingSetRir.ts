/** Eligibility is based on prescribed work rows, never completion or method parts. */
export const finalWorkingSetIndex = (types: string[]): number => {
  for (let i = types.length - 1; i >= 0; i -= 1) {
    if (!['recognition', 'warmup', 'recon'].includes(types[i])) return i;
  }
  return -1;
};

export const optionalRirValue = (value?: string | number | null): number | null => {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
};