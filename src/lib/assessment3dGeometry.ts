/** Scan geometry is in centimetres, Y up, feet at zero. No health inference. */
export type Point2 = [number, number];
export interface ScanContour { hull: Point2[]; perimeter: number; centerX: number }
export interface ScanCut { key: string; label: string; percent: number; region: 'torso' | 'left' | 'right'; range?: [number, number]; extremum?: 'min' | 'max' }
export interface ScanMeasurement { percent: number; value: number | null; manual?: boolean; hull: Point2[] }
export type ScanMeasurements = Record<string, ScanMeasurement>;
export const SCAN_MAX_BYTES = 50 * 1024 * 1024;
export const SCAN_CUTS: ScanCut[] = [
  { key: 'cintura', label: 'Cintura', percent: 61, region: 'torso', range: [58, 65], extremum: 'min' },
  { key: 'abdomen', label: 'Abdômen', percent: 57, region: 'torso' },
  { key: 'quadril', label: 'Quadril', percent: 50, region: 'torso', range: [46, 53], extremum: 'max' },
  { key: 'coxa_direita', label: 'Coxa proximal D.', percent: 44, region: 'right' },
  { key: 'coxa_esquerda', label: 'Coxa proximal E.', percent: 44, region: 'left' },
  { key: 'coxa_medial_direita', label: 'Coxa medial D.', percent: 37, region: 'right' },
  { key: 'coxa_medial_esquerda', label: 'Coxa medial E.', percent: 37, region: 'left' },
  { key: 'panturrilha_direita', label: 'Panturrilha D.', percent: 22, region: 'right', range: [18, 25], extremum: 'max' },
  { key: 'panturrilha_esquerda', label: 'Panturrilha E.', percent: 22, region: 'left', range: [18, 25], extremum: 'max' },
  { key: 'braco_direito', label: 'Braço D.', percent: 72, region: 'right', range: [67, 76], extremum: 'max' },
  { key: 'braco_esquerdo', label: 'Braço E.', percent: 72, region: 'left', range: [67, 76], extremum: 'max' },
  { key: 'torax', label: 'Tórax', percent: 72, region: 'torso' },
];

export function validateScanUpload(name: string, bytes: number, consent: boolean) {
  if (!consent) throw new Error('Confirme a autorização do aluno antes de importar.');
  const format = name.split('.').pop()?.toLowerCase();
  if (format !== 'obj' && format !== 'ply' && format !== 'glb') throw new Error('Use um arquivo OBJ, PLY ou GLB.');
  if (bytes <= 0 || bytes > SCAN_MAX_BYTES) throw new Error('O arquivo deve ter até 50 MB e não pode estar vazio.');
  return format;
}

export function scanScale(originalHeightCm: number, heightCm: number) {
  if (!Number.isFinite(originalHeightCm) || originalHeightCm <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) throw new Error('Informe uma altura válida e importe um modelo com altura.');
  return { factor: heightCm / originalHeightCm, warning: Math.abs(originalHeightCm / heightCm - 1) > 0.05 + 1e-9 };
}

export function convexHull(points: Point2[]): Point2[] {
  const unique = [...new Map(points.map(p => [`${p[0]},${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length < 3) return [];
  const cross = (o: Point2, a: Point2, b: Point2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (arr: Point2[]) => {
    const result: Point2[] = [];
    for (const p of arr) {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
      result.push(p);
    }
    result.pop(); return result;
  };
  return [...half(unique), ...half([...unique].reverse())];
}

export function hullPerimeter(hull: Point2[]) {
  return hull.reduce((sum, p, i) => { const next = hull[(i + 1) % hull.length]; return sum + Math.hypot(p[0] - next[0], p[1] - next[1]); }, 0);
}

/** Weld endpoints then follow connected segments. Never bridge different limbs. */
export function sliceContours(triangles: Float32Array, y: number): ScanContour[] {
  const nodes = new Map<string, { point: Point2; links: Set<string> }>();
  const keyOf = (p: Point2) => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`;
  for (let i = 0; i + 8 < triangles.length; i += 9) {
    const hits: Point2[] = [];
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, b = i + ((e + 1) % 3) * 3;
      const ay = triangles[a + 1], by = triangles[b + 1];
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay);
        hits.push([triangles[a] + t * (triangles[b] - triangles[a]), triangles[a + 2] + t * (triangles[b + 2] - triangles[a + 2])]);
      }
    }
    if (hits.length !== 2) continue;
    const ka = keyOf(hits[0]), kb = keyOf(hits[1]);
    if (ka === kb) continue;
    if (!nodes.has(ka)) nodes.set(ka, { point: hits[0], links: new Set() });
    if (!nodes.has(kb)) nodes.set(kb, { point: hits[1], links: new Set() });
    nodes.get(ka)?.links.add(kb); nodes.get(kb)?.links.add(ka);
  }
  const seen = new Set<string>(), contours: ScanContour[] = [];
  for (const [key] of nodes) {
    if (seen.has(key)) continue;
    const stack = [key], points: Point2[] = []; let closed = true;
    while (stack.length) {
      const current = stack.pop(); if (!current || seen.has(current)) continue;
      seen.add(current); const node = nodes.get(current); if (!node) continue;
      points.push(node.point); if (node.links.size < 2) closed = false;
      node.links.forEach(next => { if (!seen.has(next)) stack.push(next); });
    }
    const hull = convexHull(points);
    if (!closed || hull.length < 3) continue;
    const perimeter = hullPerimeter(hull);
    if (perimeter < 2) continue;
    contours.push({ hull, perimeter, centerX: hull.reduce((s, p) => s + p[0], 0) / hull.length });
  }
  return contours;
}

export function selectContour(contours: ScanContour[], cut: ScanCut): ScanContour | undefined {
  if (cut.region === 'torso') return [...contours].filter(c => Math.min(...c.hull.map(p => p[0])) < 0 && Math.max(...c.hull.map(p => p[0])) > 0).sort((a, b) => b.perimeter - a.perimeter)[0];
  const side = cut.region === 'left' ? 1 : -1;
  return [...contours].filter(c => c.hull.every(p => p[0] * side > 0)).sort((a, b) => Math.abs(b.centerX) - Math.abs(a.centerX))[0];
}

export function measureScan(triangles: Float32Array, height: number, settings: ScanMeasurements = {}): ScanMeasurements {
  const cache = new Map<number, ScanContour[]>();
  const at = (percent: number) => { let c = cache.get(percent); if (!c) { c = sliceContours(triangles, height * percent / 100); cache.set(percent, c); } return c; };
  return Object.fromEntries(SCAN_CUTS.map(cut => {
    const saved = settings[cut.key];
    let percent = saved?.percent ?? cut.percent;
    let best = selectContour(at(percent), cut);
    if (!saved && cut.range) for (let p = cut.range[0]; p <= cut.range[1]; p++) {
      const candidate = selectContour(at(p), cut);
      if (candidate && (!best || (cut.extremum === 'min' ? candidate.perimeter < best.perimeter : candidate.perimeter > best.perimeter))) { best = candidate; percent = p; }
    }
    return [cut.key, { percent, value: saved?.manual ? saved.value : best ? Math.round(best.perimeter * 10) / 10 : null, manual: saved?.manual ?? false, hull: best?.hull ?? [] }];
  }));
}

export function scanValues(measurements: ScanMeasurements): Record<string, number> {
  return Object.fromEntries(Object.entries(measurements).filter(([, m]) => typeof m.value === 'number' && Number.isFinite(m.value) && m.value > 0).map(([k, m]) => [k, m.value as number]));
}