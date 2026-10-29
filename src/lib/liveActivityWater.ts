/** Read-only water presentation and ordering for the admin activity feed. */
export interface WaterTrackingSnapshot {
  student_id: string;
  date: string;
  water_ml?: number | null;
  water_glasses?: number | null;
}

export function waterFeedKey(row: Pick<WaterTrackingSnapshot, 'student_id' | 'date'>): string {
  return `dt-water-${row.student_id}-${row.date}`;
}

export function waterTotalMl(row: Pick<WaterTrackingSnapshot, 'water_ml' | 'water_glasses'>): number {
  return row.water_ml ?? (row.water_glasses ?? 0) * 250;
}

export function waterFeedDetail(row: Pick<WaterTrackingSnapshot, 'water_ml' | 'water_glasses'>): string {
  const ml = waterTotalMl(row);
  const liters = (ml / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const glasses = row.water_glasses ?? Math.floor(ml / 250);
  return `${liters} L hoje (${glasses} ${glasses === 1 ? 'copo' : 'copos'})`;
}

export function upsertWaterFeedItem<T extends { key: string; detail?: string }>(
  items: T[], item: T, increased: boolean, limit: number,
): T[] {
  if (increased) return [item, ...items.filter(existing => existing.key !== item.key)].slice(0, limit);
  // A correction changes only the total, retaining position, last addition time and delta.
  return items.map(existing => existing.key === item.key ? { ...existing, detail: item.detail } : existing);
}