// Somatotipo Heath-Carter (método antropométrico).
// Nunca calcula componentes parcialmente: se faltar medida, informa o que falta.

export interface SomatotypeInput {
  alturaCm?: number | null;
  pesoKg?: number | null;
  tricepsMm?: number | null;
  subescapularMm?: number | null;
  supraspinaleMm?: number | null;
  panturrilhaMedialMm?: number | null;
  bracoContraidoCm?: number | null;
  panturrilhaPerimetroCm?: number | null;
  umeroCm?: number | null;
  femurCm?: number | null;
}

export type SomatotypeDominance =
  | 'endomorphy'
  | 'mesomorphy'
  | 'ectomorphy'
  | 'endomorphy_mesomorphy'
  | 'endomorphy_ectomorphy'
  | 'mesomorphy_ectomorphy'
  | 'balanced';

export interface SomatotypeResult {
  available: boolean;
  missing: string[];
  endomorfia: number | null;
  mesomorfia: number | null;
  ectomorfia: number | null;
  /** Texto legado em português (mantido por compatibilidade). */
  dominance: string | null;
  /** Valor estruturado, independente de idioma (fonte preferida). */
  dominanceKey: SomatotypeDominance | null;
}

const DOMINANCE_LABELS: Record<'pt' | 'en', Record<SomatotypeDominance, string>> = {
  pt: {
    endomorphy: 'Endomorfia predominante',
    mesomorphy: 'Mesomorfia predominante',
    ectomorphy: 'Ectomorfia predominante',
    endomorphy_mesomorphy: 'Endomorfia e Mesomorfia equilibradas',
    endomorphy_ectomorphy: 'Endomorfia e Ectomorfia equilibradas',
    mesomorphy_ectomorphy: 'Mesomorfia e Ectomorfia equilibradas',
    balanced: 'Componentes equilibrados',
  },
  en: {
    endomorphy: 'Endomorphy dominant',
    mesomorphy: 'Mesomorphy dominant',
    ectomorphy: 'Ectomorphy dominant',
    endomorphy_mesomorphy: 'Endomorphy and Mesomorphy balanced',
    endomorphy_ectomorphy: 'Endomorphy and Ectomorphy balanced',
    mesomorphy_ectomorphy: 'Mesomorphy and Ectomorphy balanced',
    balanced: 'Balanced components',
  },
};

/** Converte texto legado em português para a chave estruturada. */
export function legacyDominanceToKey(text?: string | null): SomatotypeDominance | null {
  if (!text) return null;
  const v = text.toLowerCase();
  const endo = v.includes('endomorf');
  const meso = v.includes('mesomorf');
  const ecto = v.includes('ectomorf');
  const count = [endo, meso, ecto].filter(Boolean).length;
  if (count === 3) return 'balanced';
  if (count === 2) {
    if (endo && meso) return 'endomorphy_mesomorphy';
    if (endo && ecto) return 'endomorphy_ectomorphy';
    return 'mesomorphy_ectomorphy';
  }
  if (count === 1) {
    if (endo) return 'endomorphy';
    if (meso) return 'mesomorphy';
    return 'ectomorphy';
  }
  if (v.includes('equilibrad') || v.includes('balanced')) return 'balanced';
  return null;
}

/** Texto traduzido da predominância; aceita chave ou texto legado. */
export function formatSomatotypeDominance(
  key?: SomatotypeDominance | string | null,
  lang: 'pt' | 'en' = 'pt',
  legacy?: string | null,
): string | null {
  const map = DOMINANCE_LABELS[lang];
  if (key && key in map) return map[key as SomatotypeDominance];
  const fromLegacy = legacyDominanceToKey(legacy ?? (typeof key === 'string' ? key : null));
  if (fromLegacy) return map[fromLegacy];
  return legacy ?? (typeof key === 'string' ? key : null);
}

const ok = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

const REQUIRED: { key: keyof SomatotypeInput; label: string }[] = [
  { key: 'alturaCm', label: 'altura' },
  { key: 'pesoKg', label: 'peso' },
  { key: 'tricepsMm', label: 'dobra tríceps' },
  { key: 'subescapularMm', label: 'dobra subescapular' },
  { key: 'supraspinaleMm', label: 'dobra supraespinal' },
  { key: 'panturrilhaMedialMm', label: 'dobra panturrilha medial' },
  { key: 'bracoContraidoCm', label: 'perímetro do braço contraído' },
  { key: 'panturrilhaPerimetroCm', label: 'perímetro da panturrilha' },
  { key: 'umeroCm', label: 'largura biepicondilar do úmero' },
  { key: 'femurCm', label: 'largura biepicondilar do fêmur' },
];

export function calcSomatotype(input: SomatotypeInput): SomatotypeResult {
  const missing = REQUIRED.filter((f) => !ok(input[f.key] as number | null)).map((f) => f.label);
  if (missing.length > 0) {
    return { available: false, missing, endomorfia: null, mesomorfia: null, ectomorfia: null, dominance: null };
  }

  const altura = input.alturaCm as number;
  const peso = input.pesoKg as number;

  // Endomorfia
  const x = ((input.tricepsMm as number) + (input.subescapularMm as number) + (input.supraspinaleMm as number)) * (170.18 / altura);
  const endo = -0.7182 + 0.1451 * x - 0.00068 * x * x + 0.0000014 * x * x * x;

  // Mesomorfia
  const bracoCorrigido = (input.bracoContraidoCm as number) - (input.tricepsMm as number) / 10;
  const panturrilhaCorrigida = (input.panturrilhaPerimetroCm as number) - (input.panturrilhaMedialMm as number) / 10;
  const meso =
    0.858 * (input.umeroCm as number) +
    0.601 * (input.femurCm as number) +
    0.188 * bracoCorrigido +
    0.161 * panturrilhaCorrigida -
    0.131 * altura +
    4.5;

  // Ectomorfia
  const hwr = altura / Math.cbrt(peso);
  let ecto: number;
  if (hwr >= 40.75) ecto = 0.732 * hwr - 28.58;
  else if (hwr > 38.25) ecto = 0.463 * hwr - 17.63;
  else ecto = 0.1;

  const endomorfia = r1(Math.max(0.1, endo));
  const mesomorfia = r1(Math.max(0.1, meso));
  const ectomorfia = r1(Math.max(0.1, ecto));

  const comps: [string, number][] = [
    ['Endomorfia', endomorfia],
    ['Mesomorfia', mesomorfia],
    ['Ectomorfia', ectomorfia],
  ];
  const max = Math.max(endomorfia, mesomorfia, ectomorfia);
  const tops = comps.filter(([, v]) => v === max).map(([k]) => k);
  const dominance = tops.length === 1 ? `${tops[0]} predominante` : `${tops.join(' e ')} equilibradas`;

  return { available: true, missing: [], endomorfia, mesomorfia, ectomorfia, dominance };
}

/** Converte leitura do paquímetro para centímetros. */
export function caliperToCm(value: number, unit: 'mm' | 'cm'): number {
  return unit === 'mm' ? value / 10 : value;
}

/** Faixas plausíveis (cm) para larguras ósseas. */
export const BREADTH_RANGES = {
  umero: [4.5, 9] as [number, number],
  femur: [6, 12] as [number, number],
};

export function isPlausibleBreadth(kind: 'umero' | 'femur', cm: number): boolean {
  const [min, max] = BREADTH_RANGES[kind];
  return cm >= min && cm <= max;
}
