// Regras puras da tela de execução do cardio (mesma identidade do Player do TABATA):
// cor/tag de intensidade por fase, parâmetros grandes da máquina, "A seguir", barra
// segmentada, linha do tempo e kcal por MET. Sem voz: o cardio só usa bipes. Nada aqui grava.
import type { CardioBlock, CardioBlockIntensity, CardioModality, CardioProtocol } from './cardioParser';
import { isHardBlock, mmss, ptNumber } from './cardioIntervals';
import type { PhaseTone } from './tabataPlayerView';

export type CardioPhase = 'idle' | 'prep' | 'block' | 'done';

/** "Prepare-se" antes da primeira fase. */
export const CARDIO_PREP_SECONDS = 10;
/** O mini-card "A seguir" aparece nos últimos 10 s da fase. */
export const NEXT_CARD_SECONDS = 10;

/** Baixa = verde, Moderada = amarelo, Alta = laranja, Máxima = vermelho. */
export const INTENSITY_TONE: Record<CardioBlockIntensity, PhaseTone> = {
  leve: 'rest', moderada: 'moderado', forte: 'forte', maxima: 'maximo',
};
export const INTENSITY_TAG: Record<CardioBlockIntensity, string> = {
  leve: 'Baixa', moderada: 'Moderada', forte: 'Alta', maxima: 'Máxima',
};
const intensityOf = (b: CardioBlock | undefined): CardioBlockIntensity =>
  b && INTENSITY_TAG[b.intensityLabel] ? b.intensityLabel : 'moderada';

export const blockTone = (b: CardioBlock | undefined): PhaseTone => INTENSITY_TONE[intensityOf(b)];
export const blockTag = (b: CardioBlock | undefined): string => INTENSITY_TAG[intensityOf(b)];
/** Prepare-se = azul (como o aquecimento do TABATA). */
export const phaseToneFor = (phase: CardioPhase, b: CardioBlock | undefined): PhaseTone =>
  phase === 'prep' || phase === 'idle' ? 'warmup' : blockTone(b);

export interface BigParam { label: string; value: string; unit?: string }

const POSITION: Record<string, string> = { em_pe: 'Em pé', sentado: 'Sentado', alternado: 'Alternado' };

/** O que regular na máquina, em letras grandes. */
export function blockParams(b: CardioBlock | undefined, modality: CardioModality): BigParam[] {
  if (!b) return [];
  const out: BigParam[] = [];
  const n = (v: number | undefined) => (v != null && Number.isFinite(v) ? ptNumber(v) : null);
  if (modality === 'passadeira') {
    if (n(b.speedKmh)) out.push({ label: 'Velocidade', value: n(b.speedKmh)!, unit: 'km/h' });
    if (n(b.inclinePct) != null) out.push({ label: 'Inclinação', value: n(b.inclinePct)!, unit: '%' });
  } else if (modality === 'bike') {
    // Posição primeiro: aparece no "A seguir" ("Pico forte · Em pé · nível 12 · 0:30").
    if (b.bikePosition) out.push({ label: 'Posição', value: POSITION[b.bikePosition] ?? b.bikePosition });
    if (n(b.resistanceLevel)) out.push({ label: 'Nível', value: n(b.resistanceLevel)! });
    if (n(b.cadenceRpm)) out.push({ label: 'Cadência', value: n(b.cadenceRpm)!, unit: 'rpm' });
  } else if (modality === 'eliptica') {
    if (n(b.resistanceLevel)) out.push({ label: 'Nível', value: n(b.resistanceLevel)! });
    if (n(b.cadenceRpm)) out.push({ label: 'Cadência', value: n(b.cadenceRpm)!, unit: 'spm' });
  } else if (modality === 'escada') {
    if (n(b.stepsPerMin)) out.push({ label: 'Ritmo', value: n(b.stepsPerMin)!, unit: 'degraus/min' });
    if (n(b.resistanceLevel)) out.push({ label: 'Nível', value: n(b.resistanceLevel)! });
  }
  return out;
}

export interface PositionCue { text: string; emphasis: boolean }

/** Posição da bike em destaque no player ("EM PÉ"); destaque forte quando é em pé (picos). Só bike. */
export function bikePositionCue(b: CardioBlock | undefined, modality: CardioModality): PositionCue | null {
  if (modality !== 'bike' || !b?.bikePosition || !POSITION[b.bikePosition]) return null;
  return { text: POSITION[b.bikePosition].toUpperCase(), emphasis: b.bikePosition === 'em_pe' || (b.bikePosition === 'alternado' && isHardBlock(b)) };
}

/** "Recuperação · 4 km/h · 1:00". */
export function nextPhaseText(b: CardioBlock | undefined, modality: CardioModality): string {
  if (!b) return '';
  const params = blockParams(b, modality)
    .filter(p => p.label !== 'Posição' || modality === 'bike')
    .slice(0, 2)
    .map(p => (p.unit === '%' ? `${p.value}%` : p.unit ? `${p.value} ${p.unit}` : p.label === 'Nível' ? `nível ${p.value}` : p.value));
  return [b.name, ...params, mmss(b.durationSec)].join(' · ');
}

// ───────────────────────── Linha do tempo ─────────────────────────

const dur = (b: CardioBlock | undefined) => Math.max(0, Math.round(Number(b?.durationSec) || 0));
export const totalBlocksSeconds = (blocks: CardioBlock[]) => blocks.reduce((s, b) => s + dur(b), 0);

/** Segundos percorridos no roteiro (não conta o "Prepare-se"; pular avança o roteiro). */
export function cardioElapsed(blocks: CardioBlock[], phase: CardioPhase, index: number, secondsLeft: number): number {
  if (phase === 'idle' || phase === 'prep') return 0;
  const total = totalBlocksSeconds(blocks);
  if (phase === 'done') return total;
  const before = blocks.slice(0, index).reduce((s, b) => s + dur(b), 0);
  return Math.min(total, Math.max(0, before + dur(blocks[index]) - secondsLeft));
}

export interface CardioSegment { index: number; tone: PhaseTone; seconds: number; fill: number; hard: boolean }

/** Uma barrinha por fase, na cor da intensidade, larga pela duração — o aluno vê os picos. */
export function cardioSegments(blocks: CardioBlock[], elapsed: number): CardioSegment[] {
  let start = 0;
  return blocks.map((b, index) => {
    const seconds = dur(b);
    const fill = seconds > 0 ? Math.min(1, Math.max(0, (elapsed - start) / seconds)) : elapsed >= start ? 1 : 0;
    start += seconds;
    return { index, tone: blockTone(b), seconds, fill, hard: isHardBlock(b) };
  });
}

/** "Fase 3 de 20". */
export const phaseCountLabel = (index: number, total: number) => `Fase ${Math.min(total, index + 1)} de ${total}`;

// ───────────────────────── Calorias (MET) ─────────────────────────

/** Modalidades do "Finalizar Cardio" (as 4 máquinas + ao ar livre). */
export type CardioFinishModality = CardioModality | 'corrida_ar_livre' | 'caminhada_ar_livre';
export const FINISH_MODALITIES: ReadonlyArray<{ value: CardioFinishModality; label: string }> = [
  { value: 'passadeira', label: 'Esteira' },
  { value: 'bike', label: 'Bike' },
  { value: 'eliptica', label: 'Elíptica' },
  { value: 'escada', label: 'Escada' },
  { value: 'corrida_ar_livre', label: 'Corrida ao ar livre' },
  { value: 'caminhada_ar_livre', label: 'Caminhada ao ar livre' },
];
export const finishModalityLabel = (m: string | null | undefined) =>
  FINISH_MODALITIES.find(x => x.value === m)?.label ?? '';

/** MET por intensidade da fase (Compendium of Physical Activities). */
const MET_BY_INTENSITY: Record<CardioFinishModality, Record<CardioBlockIntensity, number>> = {
  passadeira: { leve: 3.5, moderada: 5.0, forte: 8.0, maxima: 10.0 },
  bike: { leve: 3.5, moderada: 6.8, forte: 8.8, maxima: 11.0 },
  eliptica: { leve: 4.5, moderada: 5.5, forte: 7.0, maxima: 8.5 },
  escada: { leve: 5.5, moderada: 8.0, forte: 9.5, maxima: 11.0 },
  corrida_ar_livre: { leve: 7.0, moderada: 8.3, forte: 9.8, maxima: 11.5 },
  caminhada_ar_livre: { leve: 3.0, moderada: 3.5, forte: 4.3, maxima: 5.0 },
};

/** Esteira/rua pela velocidade (equações do ACSM): caminhada até 6,5 km/h, corrida acima. */
export function speedMet(speedKmh: number, inclinePct = 0): number {
  const S = (speedKmh * 1000) / 60; // m/min
  const G = Math.max(0, inclinePct) / 100;
  const vo2 = speedKmh <= 6.5 ? 3.5 + 0.1 * S + 1.8 * S * G : 3.5 + 0.2 * S + 0.9 * S * G;
  return vo2 / 3.5;
}

const blockMet = (b: CardioBlock, modality: CardioFinishModality, planModality: CardioModality): number => {
  if (modality === 'passadeira' && planModality === 'passadeira' && b.speedKmh) return speedMet(b.speedKmh, b.inclinePct ?? 0);
  return MET_BY_INTENSITY[modality][intensityOf(b)];
};

/** MET médio da sessão (ponderado pelo tempo de cada fase). */
export function sessionMet(input: {
  modality: CardioFinishModality; protocol: Pick<CardioProtocol, 'modality' | 'blocks'> | null;
  durationSec: number; distanceKm?: number | null;
}): number {
  const { modality, protocol, durationSec, distanceKm } = input;
  const outdoor = modality === 'corrida_ar_livre' || modality === 'caminhada_ar_livre';
  if (outdoor && distanceKm && distanceKm > 0 && durationSec > 0) {
    const kmh = distanceKm / (durationSec / 3600);
    return speedMet(kmh, 0);
  }
  const blocks = protocol?.blocks ?? [];
  const total = totalBlocksSeconds(blocks);
  if (!blocks.length || total <= 0) return MET_BY_INTENSITY[modality].moderada;
  const weighted = blocks.reduce((s, b) => s + blockMet(b, modality, protocol!.modality) * dur(b), 0);
  return weighted / total;
}

export const DEFAULT_WEIGHT_KG = 70;

/** kcal ≈ MET × peso (kg) × horas. */
export function estimateCardioKcal(input: {
  modality: CardioFinishModality; protocol: Pick<CardioProtocol, 'modality' | 'blocks'> | null;
  durationSec: number; weightKg?: number | null; distanceKm?: number | null;
}): number {
  const weight = input.weightKg && input.weightKg > 20 && input.weightKg < 400 ? input.weightKg : DEFAULT_WEIGHT_KG;
  const hours = Math.max(0, input.durationSec) / 3600;
  return Math.round(sessionMet(input) * weight * hours);
}

/** "Como foi?" — 5 barras crescentes (gravado como 1–5). */
export const EFFORT_LABELS = ['Muito fácil', 'Fácil', 'Moderado', 'Difícil', 'Muito difícil'] as const;
export const effortLabel = (v: number | null | undefined) => (v && v >= 1 && v <= 5 ? EFFORT_LABELS[v - 1] : '');

// ───────────────────────── Voz do Fabiew ─────────────────────────
