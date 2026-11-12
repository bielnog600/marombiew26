/**
 * Pesar refeição — foto automática. Regras puras: diferença entre quadros
 * reduzidos (tons de cinza), máquina de estados "mexeu → parou ~1,5 s →
 * 3-2-1 → foto" e checagem de prato/comida dentro da moldura a partir das
 * caixas do detector. Nada aqui toca câmera, canvas ou MediaPipe.
 */

/** Tamanho do quadro reduzido usado para medir movimento. */
export const AUTO_FRAME_W = 32;
export const AUTO_FRAME_H = 24;
/** Imagem parada por este tempo antes de começar a contagem. */
export const AUTO_STABLE_MS = 1500;
/** Contagem 3-2-1. */
export const AUTO_COUNTDOWN_MS = 3000;
/** Diferença média (0–255) até a qual a imagem conta como parada. */
export const AUTO_STILL_DIFF = 6;
/** Durante a contagem, acima disto a câmera mexeu e a contagem cancela. */
export const AUTO_MOVE_DIFF = 10;
export const AUTO_CAPTURE_STORAGE_KEY = 'meal-weigh:auto-capture';
export const SCALE_DISPLAY_HINT = 'Deixa o visor da balança aparecendo';

/** RGBA → luminância (um valor por pixel). */
export function rgbaToGray(rgba: ArrayLike<number>): Uint8Array {
  const n = Math.floor((rgba?.length ?? 0) / 4);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[i] = (rgba[o] * 77 + rgba[o + 1] * 150 + rgba[o + 2] * 29) >> 8;
  }
  return out;
}

/** Diferença média absoluta entre dois quadros (0 = iguais, 255 = opostos); null se não comparáveis. */
export function frameDifference(a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) return null;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

export type AutoCapturePhase =
  /** Recém-armada: espera a cena mudar (mão colocando o alimento) antes de contar. */
  | 'waiting_motion'
  /** Mexendo ou parando: conta o tempo parado. */
  | 'settling'
  /** Parou, mas o detector não vê prato/comida na moldura. */
  | 'no_object'
  | 'countdown'
  /** Foto tirada: não dispara de novo até ser rearmada. */
  | 'fired';

export interface AutoCaptureState {
  phase: AutoCapturePhase;
  stableSince: number | null;
  countdownStart: number | null;
}

export interface AutoCaptureConfig {
  stableMs: number;
  countdownMs: number;
  stillDiff: number;
  moveDiff: number;
}

export const AUTO_CAPTURE_CONFIG: AutoCaptureConfig = {
  stableMs: AUTO_STABLE_MS,
  countdownMs: AUTO_COUNTDOWN_MS,
  stillDiff: AUTO_STILL_DIFF,
  moveDiff: AUTO_MOVE_DIFF,
};

export const initialAutoCapture = (): AutoCaptureState => ({ phase: 'waiting_motion', stableSince: null, countdownStart: null });

export interface AutoCaptureInput {
  now: number;
  /** Diferença para o quadro anterior; null = primeiro quadro. */
  diff: number | null;
  /** Prato/comida na moldura; null = detector indisponível (usa só a estabilidade). */
  hasObject: boolean | null;
}

export interface AutoCaptureStep {
  state: AutoCaptureState;
  /** true só no instante de tirar a foto. */
  fire: boolean;
  /** 3, 2 ou 1 durante a contagem. */
  count: number | null;
  /** 0..1 da contagem (anel que se fecha). */
  progress: number;
}

export function stepAutoCapture(
  state: AutoCaptureState,
  input: AutoCaptureInput,
  cfg: AutoCaptureConfig = AUTO_CAPTURE_CONFIG,
): AutoCaptureStep {
  const idle = (s: AutoCaptureState): AutoCaptureStep => ({ state: s, fire: false, count: null, progress: 0 });
  if (state.phase === 'fired') return idle(state);
  const { now, diff, hasObject } = input;
  if (diff == null) {
    if (state.phase === 'countdown' && state.countdownStart != null) return countdownStep(state, now, cfg);
    return idle(state);
  }

  if (state.phase === 'countdown') {
    if (diff > cfg.moveDiff) return idle({ phase: 'settling', stableSince: null, countdownStart: null });
    return countdownStep(state, now, cfg);
  }

  if (state.phase === 'waiting_motion') {
    if (diff > cfg.stillDiff) return idle({ phase: 'settling', stableSince: null, countdownStart: null });
    return idle(state);
  }

  // settling / no_object
  if (diff > cfg.stillDiff) return idle({ phase: 'settling', stableSince: null, countdownStart: null });
  const stableSince = state.stableSince ?? now;
  if (now - stableSince < cfg.stableMs) return idle({ phase: 'settling', stableSince, countdownStart: null });
  if (hasObject === false) return idle({ phase: 'no_object', stableSince, countdownStart: null });
  return { state: { phase: 'countdown', stableSince, countdownStart: now }, fire: false, count: 3, progress: 0 };
}

function countdownStep(state: AutoCaptureState, now: number, cfg: AutoCaptureConfig): AutoCaptureStep {
  const elapsed = Math.max(0, now - (state.countdownStart ?? now));
  if (elapsed >= cfg.countdownMs) {
    return { state: { ...state, phase: 'fired' }, fire: true, count: null, progress: 1 };
  }
  const steps = Math.max(1, Math.round(cfg.countdownMs / 1000));
  const count = Math.min(steps, Math.max(1, steps - Math.floor(elapsed / 1000)));
  return { state, fire: false, count, progress: elapsed / cfg.countdownMs };
}

/* --------------------- Prato/comida dentro da moldura -------------------- */

/** Categorias do efficientdet_lite0 (COCO) que indicam prato, recipiente ou comida. */
export const FOOD_DETECTION_LABELS = new Set([
  'bowl', 'cup', 'dining table', 'wine glass', 'bottle', 'fork', 'knife', 'spoon',
  'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
]);
export const FOOD_DETECTION_MIN_SCORE = 0.3;

export interface Box { x: number; y: number; width: number; height: number }
export interface DetectionBox extends Box { label: string; score: number }

/**
 * Converte um retângulo da tela (relativo ao elemento de vídeo) para pixels do
 * quadro da câmera, considerando `object-fit: cover` (vídeo centralizado e cortado).
 */
export function screenRectToVideo(rect: Box, element: { width: number; height: number }, video: { width: number; height: number }): Box {
  const ew = Math.max(1, element.width);
  const eh = Math.max(1, element.height);
  const vw = Math.max(1, video.width);
  const vh = Math.max(1, video.height);
  const scale = Math.max(ew / vw, eh / vh);
  const offX = (ew - vw * scale) / 2;
  const offY = (eh - vh * scale) / 2;
  return {
    x: (rect.x - offX) / scale,
    y: (rect.y - offY) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

const overlapArea = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Há prato/tigela/copo/comida com centro dentro da moldura (ou com metade da caixa dentro dela)? */
export function foodInGuide(detections: DetectionBox[], guide: Box, minScore = FOOD_DETECTION_MIN_SCORE): boolean {
  return (detections ?? []).some((d) => {
    if (!FOOD_DETECTION_LABELS.has(String(d.label ?? '').toLowerCase()) || !(d.score >= minScore)) return false;
    const cx = d.x + d.width / 2;
    const cy = d.y + d.height / 2;
    const centerInside = cx >= guide.x && cx <= guide.x + guide.width && cy >= guide.y && cy <= guide.y + guide.height;
    const area = d.width * d.height;
    return centerInside || (area > 0 && overlapArea(d, guide) / area >= 0.5);
  });
}

/** Preferência "Foto automática" (ligada por padrão). */
export function readAutoCapturePref(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try { return storage?.getItem(AUTO_CAPTURE_STORAGE_KEY) !== '0'; } catch { return true; }
}
export function writeAutoCapturePref(storage: Pick<Storage, 'setItem'> | null | undefined, on: boolean): void {
  try { storage?.setItem(AUTO_CAPTURE_STORAGE_KEY, on ? '1' : '0'); } catch { /* armazenamento bloqueado */ }
}
