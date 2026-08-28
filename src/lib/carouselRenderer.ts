// Renderizador de slides de carrossel (1080x1350) para a área Rede Social (admin).
import { drawCover, type ReelTheme } from './reelsRenderer';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export type CarouselTextPosition = 'below' | 'above' | 'overlay';
export type CarouselStyle = 'classic' | 'full' | 'minimal' | 'split' | 'poster' | 'frame' | 'stack';
export type CarouselDualLayout = 'vertical' | 'horizontal';

export const CAROUSEL_STYLES: { value: CarouselStyle; label: string }[] = [
  { value: 'classic', label: 'Clássico (mídia em card)' },
  { value: 'full', label: 'Full bleed (mídia de fundo)' },
  { value: 'minimal', label: 'Minimalista (limpo)' },
  { value: 'split', label: 'Split (bloco de cor no texto)' },
  { value: 'poster', label: 'Poster (título gigante à esquerda)' },
  { value: 'frame', label: 'Moldura (borda destacada)' },
  { value: 'stack', label: 'Revista (faixa lateral + mídia grande)' },
];

export const CAROUSEL_TEXT_POSITIONS: { value: CarouselTextPosition; label: string }[] = [
  { value: 'below', label: 'Texto abaixo da mídia' },
  { value: 'above', label: 'Texto acima da mídia' },
  { value: 'overlay', label: 'Texto sobre a mídia' },
];

export const CAROUSEL_DUAL_LAYOUTS: { value: CarouselDualLayout; label: string }[] = [
  { value: 'vertical', label: 'Empilhado (uma acima da outra)' },
  { value: 'horizontal', label: 'Lado a lado' },
];

export interface CarouselSlideDraw {
  theme: ReelTheme;
  logo?: HTMLImageElement | null;
  title: string;
  text?: string;
  media?: HTMLVideoElement | HTMLImageElement | null;
  /** Segunda mídia (ex.: vídeo + imagem). Quando presente, a área de mídia é dividida. */
  mediaB?: HTMLVideoElement | HTMLImageElement | null;
  dualLayout?: CarouselDualLayout;
  footer?: string;
  index: number;
  total: number;
  textPosition?: CarouselTextPosition;
  style?: CarouselStyle;
}

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let current = '';
    if (!words.length) { lines.push(''); continue; }
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else { lines.push(current); current = word; }
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (current) lines.push(current);
  }
  return lines.slice(0, maxLines);
};

const drawFooter = (ctx: CanvasRenderingContext2D, theme: ReelTheme, footer: string | undefined, index: number, total: number) => {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = '900 32px Inter, system-ui, sans-serif';
  ctx.fillText(`${index + 1}/${total}`, SLIDE_W / 2, SLIDE_H - 84);
  if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 34px Inter, system-ui, sans-serif';
    ctx.fillText(footer.toUpperCase(), SLIDE_W / 2, SLIDE_H - 36);
  }
  ctx.restore();
};

type Media = HTMLVideoElement | HTMLImageElement;




const paintMedia = (
  ctx: CanvasRenderingContext2D,
  theme: ReelTheme,
  media: Media,
  x: number, y: number, w: number, h: number,
  radius: number,
  withBorder: boolean,
) => {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x, y, w, h);
  drawCover(ctx, media, x, y, w, h);
  ctx.restore();
  if (withBorder) {
    ctx.save();
    roundRectPath(ctx, x + 2, y + 2, w - 4, h - 4, radius);
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
};

const mediaRects = (
  count: number,
  layout: CarouselDualLayout,
  x: number, y: number, w: number, h: number,
) => {
  if (count < 2) return [{ x, y, w, h }];
  const gap = 18;
  if (layout === 'horizontal') {
    const cw = (w - gap) / 2;
    return [{ x, y, w: cw, h }, { x: x + cw + gap, y, w: cw, h }];
  }
  const ch = (h - gap) / 2;
  return [{ x, y, w, h: ch }, { x, y: y + ch + gap, w, h: ch }];
};

export const drawCarouselSlide = (ctx: CanvasRenderingContext2D, opts: CarouselSlideDraw) => {
  const { theme, logo, title, text, media, mediaB, footer, index, total } = opts;
  const style: CarouselStyle = opts.style ?? 'classic';
  const textPosition: CarouselTextPosition = opts.textPosition ?? 'below';
  const dualLayout: CarouselDualLayout = opts.dualLayout ?? 'vertical';
  const medias = [media, mediaB].filter(Boolean) as Media[];
  const W = SLIDE_W;
  const H = SLIDE_H;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, theme.bg1);
  grad.addColorStop(1, theme.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ---------- Estilo FULL BLEED ----------
  if (style === 'full' && medias.length) {
    if (medias.length > 1) {
      const rects = mediaRects(2, dualLayout, 0, 0, W, H);
      rects.forEach((r, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.w, r.h);
        ctx.clip();
        drawCover(ctx, medias[i], r.x, r.y, r.w, r.h);
        ctx.restore();
      });
    } else {
      drawCover(ctx, medias[0], 0, 0, W, H);
    }
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    if (textPosition === 'above') {
      scrim.addColorStop(0, 'rgba(0,0,0,0.82)');
      scrim.addColorStop(0.55, 'rgba(0,0,0,0.15)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.75)');
    } else if (textPosition === 'overlay') {
      scrim.addColorStop(0, 'rgba(0,0,0,0.55)');
      scrim.addColorStop(0.5, 'rgba(0,0,0,0.6)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.7)');
    } else {
      scrim.addColorStop(0, 'rgba(0,0,0,0.72)');
      scrim.addColorStop(0.45, 'rgba(0,0,0,0.12)');
      scrim.addColorStop(1, 'rgba(0,0,0,0.85)');
    }
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);

    let topY = 96;
    if (logo && logo.naturalWidth) {
      const logoW = 220;
      const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
      ctx.drawImage(logo, (W - logoW) / 2, 60, logoW, logoH);
      topY = 60 + logoH + 40;
    }

    ctx.fillStyle = theme.text;
    ctx.font = '900 74px Inter, system-ui, sans-serif';
    const titleLines = wrapLines(ctx, (title || '').toUpperCase(), W - 120, 3);
    const textLines = text
      ? (ctx.font = '700 42px Inter, system-ui, sans-serif', wrapLines(ctx, text, W - 140, 6))
      : [];

    const blockH = titleLines.length * 84 + (textLines.length ? 30 + textLines.length * 54 : 0);
    let y: number;
    if (textPosition === 'above') y = topY + 40;
    else if (textPosition === 'overlay') y = (H - blockH) / 2;
    else y = H - 170 - blockH;

    ctx.fillStyle = theme.text;
    ctx.font = '900 74px Inter, system-ui, sans-serif';
    titleLines.forEach((line, i) => ctx.fillText(line, W / 2, y + 66 + i * 84));
    y += titleLines.length * 84;
    if (textLines.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.font = '700 42px Inter, system-ui, sans-serif';
      let ty = y + 54;
      textLines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += 54; });
    }
    drawFooter(ctx, theme, footer, index, total);
    return;
  }

  // ---------- Decorações por estilo ----------
  if (style === 'classic') {
    ctx.save();
    ctx.globalAlpha = 0.18;
    const stripe = ctx.createLinearGradient(0, 0, W, H * 0.5);
    stripe.addColorStop(0, theme.accent);
    stripe.addColorStop(1, theme.accent2);
    ctx.fillStyle = stripe;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.20);
    ctx.lineTo(W, H * 0.10);
    ctx.lineTo(W, H * 0.17);
    ctx.lineTo(0, H * 0.27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (style === 'stack') {
    ctx.save();
    const band = ctx.createLinearGradient(0, 0, 0, H);
    band.addColorStop(0, theme.accent);
    band.addColorStop(1, theme.accent2);
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, 22, H);
    ctx.restore();
  }

  if (style === 'frame') {
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 10;
    roundRectPath(ctx, 26, 26, W - 52, H - 52, 42);
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3;
    roundRectPath(ctx, 46, 46, W - 92, H - 92, 32);
    ctx.stroke();
    ctx.restore();
  }

  const leftAligned = style === 'poster' || style === 'stack';
  const contentLeft = style === 'stack' ? 78 : 70;
  const contentRight = style === 'frame' ? 70 : 60;
  const centerX = W / 2;
  const textX = leftAligned ? contentLeft : centerX;
  ctx.textAlign = leftAligned ? 'left' : 'center';

  let cursorY = style === 'minimal' ? 70 : style === 'frame' ? 92 : 80;
  if (logo && logo.naturalWidth) {
    const logoW = style === 'minimal' ? 200 : style === 'poster' ? 180 : 260;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    ctx.drawImage(logo, leftAligned ? contentLeft : (W - logoW) / 2, cursorY, logoW, logoH);
    cursorY += logoH + 26;
  } else {
    cursorY += 30;
  }

  // Título
  const titleSize = style === 'minimal' ? 66 : style === 'poster' ? 88 : 72;
  const titleLineH = style === 'poster' ? 94 : 80;
  ctx.fillStyle = theme.text;
  ctx.font = `900 ${titleSize}px Inter, system-ui, sans-serif`;
  const titleMaxW = leftAligned ? W - contentLeft - contentRight : W - 130;
  const titleLines = wrapLines(ctx, (title || '').toUpperCase(), titleMaxW, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, textX, cursorY + 66 + i * titleLineH));
  cursorY += titleLines.length ? 66 + titleLines.length * titleLineH : 20;

  if ((style === 'minimal' || style === 'poster' || style === 'stack') && titleLines.length) {
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = style === 'poster' ? 10 : 6;
    ctx.beginPath();
    const lineW = style === 'minimal' ? 70 : 110;
    const sx = leftAligned ? contentLeft : centerX - lineW;
    ctx.moveTo(sx, cursorY + 6);
    ctx.lineTo(leftAligned ? contentLeft + lineW * 1.6 : centerX + lineW, cursorY + 6);
    ctx.stroke();
    ctx.restore();
    cursorY += 34;
  }

  const bottomReserved = 130;
  const areaTop = cursorY + 24;
  const areaBottom = H - bottomReserved;

  const textFontSize = style === 'minimal' ? 40 : 38;
  const textLineH = style === 'minimal' ? 52 : 48;
  const maxTextLines = 5;

  if (medias.length) {
    ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
    const mx = style === 'stack' ? 60 : style === 'frame' ? 80 : 60;
    const mw = W - mx * 2;
    const textMaxW = leftAligned ? W - contentLeft - contentRight : W - 140;
    const textLines = text && textPosition !== 'overlay' ? wrapLines(ctx, text, textMaxW, maxTextLines) : [];
    const textBlockH = textLines.length ? (style === 'split' ? 60 : 40) + textLines.length * textLineH : 0;
    const mediaH = Math.max(280, areaBottom - areaTop - textBlockH);
    const mediaTop = textPosition === 'above' ? areaTop + textBlockH : areaTop;
    const radius = style === 'minimal' ? 24 : style === 'poster' ? 16 : 36;

    const rects = mediaRects(medias.length, dualLayout, mx, mediaTop, mw, mediaH);
    rects.forEach((r, i) => paintMedia(ctx, theme, medias[i], r.x, r.y, r.w, r.h, radius, style !== 'minimal' && style !== 'poster'));

    if (textPosition === 'overlay' && text) {
      const last = rects[rects.length - 1];
      ctx.save();
      roundRectPath(ctx, last.x, last.y, last.w, last.h, radius);
      ctx.clip();
      const overlay = ctx.createLinearGradient(0, last.y, 0, last.y + last.h);
      overlay.addColorStop(0, 'rgba(0,0,0,0.1)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = overlay;
      ctx.fillRect(last.x, last.y, last.w, last.h);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const lines = wrapLines(ctx, text, last.w - 80, maxTextLines);
      let ty = last.y + last.h - 44 - (lines.length - 1) * textLineH;
      lines.forEach((line) => { ctx.fillText(line, last.x + last.w / 2, ty); ty += textLineH; });
      ctx.restore();
      ctx.textAlign = leftAligned ? 'left' : 'center';
    }

    if (textLines.length) {
      const blockTop = textPosition === 'above' ? areaTop : mediaTop + mediaH + 20;
      if (style === 'split') {
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = theme.accent;
        roundRectPath(ctx, 46, blockTop, W - 92, textBlockH - 6, 28);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
      let ty = blockTop + (style === 'split' ? 62 : 44);
      textLines.forEach((line) => { ctx.fillText(line, textX, ty); ty += textLineH; });
    }
  } else if (text) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${style === 'minimal' ? 48 : 46}px Inter, system-ui, sans-serif`;
    const lines = wrapLines(ctx, text, leftAligned ? W - contentLeft - contentRight : W - 150, 12);
    const blockH = lines.length * 62;
    let ty = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) + 46;
    if (style === 'split') {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = theme.accent;
      roundRectPath(ctx, 46, ty - 66, W - 92, blockH + 60, 28);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `700 46px Inter, system-ui, sans-serif`;
    }
    lines.forEach((line) => { ctx.fillText(line, textX, ty); ty += 62; });
  }

  drawFooter(ctx, theme, footer, index, total);
};
