/**
 * Escolha pura do tamanho de fonte/forma do resumo de séries numa linha só.
 * 1) forma completa no tamanho base, encolhendo até `minPx`;
 * 2) se não couber, forma compacta, encolhendo até `minPx`;
 * 3) caso extremo (muitas séries), a compacta encolhe até `floorPx` para
 *    nunca cortar nem quebrar linha.
 */
export interface SummaryFit { variant: 'full' | 'compact'; px: number }

export const chooseSummaryFit = (
  availablePx: number,
  fullWidthAtBase: number,
  compactWidthAtBase: number,
  basePx: number,
  minPx = 11,
  floorPx = 9,
): SummaryFit => {
  const sizeFor = (width: number) => {
    if (!(availablePx > 0) || !(width > 0)) return basePx;
    // margem de 3% para arredondamentos de subpixel
    const px = (basePx * availablePx * 0.97) / width;
    return Math.min(basePx, Math.floor(px * 10) / 10);
  };
  const full = sizeFor(fullWidthAtBase);
  if (full >= minPx) return { variant: 'full', px: full };
  const compact = sizeFor(compactWidthAtBase);
  return { variant: 'compact', px: Math.max(floorPx, compact) };
};
