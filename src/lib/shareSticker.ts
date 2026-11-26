// Pure helpers for the workout share "Sticker" editor (position, scale, presets, export geometry).
export const STICKER_PRESETS = [
  { value: 'tempo', label: 'Tempo' },
  { value: 'mini', label: 'Mini card' },
  { value: 'frequencia', label: 'Frequência' },
  { value: 'selo', label: 'Selo' },
  { value: 'logo-topo-grande', label: 'Logo topo grande' },
  { value: 'logo-topo-pequena', label: 'Logo topo pequena' },
  { value: 'logo-central', label: 'Logo central' },
  { value: 'logo-embaixo', label: 'Logo embaixo' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'faixa', label: 'Faixa' },
  { value: 'coluna', label: 'Coluna' },
  { value: 'semana-destaque', label: 'Semana em destaque' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'marca-dagua', label: "Marca d'água" },
] as const;

export const STICKER_STYLES = STICKER_PRESETS.map((preset) => preset.value) as StickerStyle[];
export type StickerStyle = (typeof STICKER_PRESETS)[number]['value'];
export type StickerLogoSize = 'P' | 'M' | 'G';
export type StickerBackground = 'transparente' | 'vidro';

export const STICKER_MIN_SCALE = 0.5;
export const STICKER_MAX_SCALE = 2.5;
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
export const TAP_MAX_MOVE_PX = 8;

export const clampStickerScale = (s: number) =>
  Math.min(STICKER_MAX_SCALE, Math.max(STICKER_MIN_SCALE, Number.isFinite(s) ? s : 1));

export const nextStickerStyle = (style: StickerStyle): StickerStyle =>
  STICKER_STYLES[(STICKER_STYLES.indexOf(style) + 1) % STICKER_STYLES.length];

/** Position is the sticker center as a 0..1 fraction of the preview. */
export const clampStickerPosition = (p: { x: number; y: number }) => ({
  x: Math.min(1, Math.max(0, p.x)),
  y: Math.min(1, Math.max(0, p.y)),
});

export const dragStickerPosition = (
  start: { x: number; y: number },
  dx: number,
  dy: number,
  area: { width: number; height: number },
) =>
  clampStickerPosition({
    x: start.x + (area.width ? dx / area.width : 0),
    y: start.y + (area.height ? dy / area.height : 0),
  });

export const pinchStickerScale = (startScale: number, startDistance: number, distance: number) =>
  clampStickerScale(startDistance > 0 ? startScale * (distance / startDistance) : startScale);

/** Rect to draw an image so it covers the target (object-fit: cover). */
export const coverRect = (imgW: number, imgH: number, boxW: number, boxH: number) => {
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
};

/** Where to draw the sticker on the 1080×1920 story given its preview geometry. */
export const stickerStoryRect = (
  pos: { x: number; y: number },
  scale: number,
  sticker: { width: number; height: number },
  previewWidth: number,
) => {
  const ratio = STORY_WIDTH / previewWidth;
  const w = sticker.width * scale * ratio;
  const h = sticker.height * scale * ratio;
  return { x: pos.x * STORY_WIDTH - w / 2, y: pos.y * STORY_HEIGHT - h / 2, w, h };
};
