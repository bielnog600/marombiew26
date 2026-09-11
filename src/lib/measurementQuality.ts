// Controle de qualidade das aferições de dobras cutâneas.
// Regra: duas aferições iniciais. Se a variação relativa (base = menor valor)
// for maior que 5%, é necessária uma terceira aferição e usa-se a MEDIANA.

export const VARIATION_TOLERANCE_PERCENT = 5;

export type FoldQualityStatus =
  | 'empty'          // nenhuma aferição
  | 'single'         // apenas uma aferição
  | 'consistent'     // duas aferições dentro da tolerância → média
  | 'needs_third'    // divergentes e sem terceira aferição → bloquear
  | 'resolved_median'; // três aferições → mediana

export interface FoldQuality {
  measurements: number[];
  usedValue: number | null;
  variationPercent: number | null;
  status: FoldQualityStatus;
  needsThird: boolean;
  /** true quando o valor pode ser usado no cálculo do protocolo */
  usable: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const median = (values: number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Variação relativa entre duas aferições, tendo o menor valor como base. */
export function variationPercent(a: number, b: number): number {
  const base = Math.min(a, b);
  if (base <= 0) return 0;
  return Math.round((Math.abs(a - b) / base) * 1000) / 10;
}

export function evaluateFold(m1?: unknown, m2?: unknown, m3?: unknown): FoldQuality {
  const v1 = num(m1);
  const v2 = num(m2);
  const v3 = num(m3);
  const measurements = [v1, v2, v3].filter((v): v is number => v != null);

  if (measurements.length === 0) {
    return { measurements, usedValue: null, variationPercent: null, status: 'empty', needsThird: false, usable: false };
  }

  if (measurements.length === 1) {
    return {
      measurements,
      usedValue: round1(measurements[0]),
      variationPercent: null,
      status: 'single',
      needsThird: false,
      usable: true,
    };
  }

  if (measurements.length === 2) {
    const diff = variationPercent(measurements[0], measurements[1]);
    if (diff > VARIATION_TOLERANCE_PERCENT) {
      return {
        measurements,
        usedValue: null,
        variationPercent: diff,
        status: 'needs_third',
        needsThird: true,
        usable: false,
      };
    }
    return {
      measurements,
      usedValue: round1((measurements[0] + measurements[1]) / 2),
      variationPercent: diff,
      status: 'consistent',
      needsThird: false,
      usable: true,
    };
  }

  // três aferições → mediana
  const diff = variationPercent(measurements[0], measurements[1]);
  return {
    measurements,
    usedValue: round1(median(measurements)),
    variationPercent: diff,
    status: 'resolved_median',
    needsThird: false,
    usable: true,
  };
}

export const qualityStatusLabel = (status: FoldQualityStatus): string => {
  switch (status) {
    case 'consistent': return 'Medidas consistentes';
    case 'resolved_median': return 'Mediana de 3 aferições';
    case 'needs_third': return 'Medidas divergentes — realize uma terceira aferição';
    case 'single': return 'Apenas uma aferição';
    default: return 'Sem aferição';
  }
};
