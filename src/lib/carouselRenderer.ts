// Renderizador de slides de carrossel (1080x1350) para a área Rede Social (admin).
import { drawCover, type ReelTheme } from './reelsRenderer';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export type CarouselTextPosition = 'below' | 'above' | 'overlay';
export type CarouselStyle = 'classic' | 'full' | 'minimal';

export const CAROUSEL_STYLES: { value: CarouselStyle; label: string }[] = [
  { value: 'classic', label: 'Clássico (mídia em card)' },
  { value: 'full', label: 'Full bleed (mídia de fundo)' },
  { value: 'minimal', label: 'Minimalista (limpo)' },
];

export const CAROUSEL_TEXT_POSITIONS: { value: CarouselTextPosition; label: string }[] = [
  { value: 'below', label: 'Texto abaixo da mídia' },
  { value: 'above', label: 'Texto acima da mídia' },
  { value: 'overlay', label: 'Texto sobre a mídia' },
];

export interface CarouselSlideDraw {
  theme: ReelTheme;
  logo?: HTMLImageElement | null;
  title: string;
  text?: string;
  media?: HTMLVideoElement | HTMLImageElement | null;
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

export const drawCarouselSlide = (ctx: CanvasRenderingContext2D, opts: CarouselSlideDraw) => {
  const { theme, logo, title, text, media, footer, index, total } = opts;
  const style: CarouselStyle = opts.style ?? 'classic';
  const textPosition: CarouselTextPosition = opts.textPosition ?? 'below';
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
  if (style === 'full' && media) {
    drawCover(ctx, media, 0, 0, W, H);
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

  // ---------- Faixa decorativa (clássico) ----------
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

  let cursorY = style === 'minimal' ? 70 : 80;
  if (logo && logo.naturalWidth) {
    const logoW = style === 'minimal' ? 200 : 260;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, cursorY, logoW, logoH);
    cursorY += logoH + 26;
  } else {
    cursorY += 30;
  }

  // Título
  const titleSize = style === 'minimal' ? 66 : 72;
  ctx.fillStyle = theme.text;
  ctx.font = `900 ${titleSize}px Inter, system-ui, sans-serif`;
  const titleLines = wrapLines(ctx, (title || '').toUpperCase(), W - 130, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, cursorY + 66 + i * 80));
  cursorY += titleLines.length ? 66 + titleLines.length * 80 : 20;

  if (style === 'minimal' && titleLines.length) {
    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 70, cursorY + 6);
    ctx.lineTo(W / 2 + 70, cursorY + 6);
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

  if (media) {
    ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
    const textLines = text && textPosition !== 'overlay' ? wrapLines(ctx, text, W - 140, maxTextLines) : [];
    const textBlockH = textLines.length ? 40 + textLines.length * textLineH : 0;
    const mediaH = Math.max(260, areaBottom - areaTop - textBlockH);
    const mx = 60;
    const mw = W - 120;
    const mediaTop = textPosition === 'above' ? areaTop + textBlockH : areaTop;
    const radius = style === 'minimal' ? 24 : 36;

    ctx.save();
    roundRectPath(ctx, mx, mediaTop, mw, mediaH, radius);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(mx, mediaTop, mw, mediaH);
    drawCover(ctx, media, mx, mediaTop, mw, mediaH);
    if (textPosition === 'overlay' && text) {
      const overlay = ctx.createLinearGradient(0, mediaTop, 0, mediaTop + mediaH);
      overlay.addColorStop(0, 'rgba(0,0,0,0.1)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = overlay;
      ctx.fillRect(mx, mediaTop, mw, mediaH);
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
      const lines = wrapLines(ctx, text, mw - 80, maxTextLines);
      let ty = mediaTop + mediaH - 44 - (lines.length - 1) * textLineH;
      lines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += textLineH; });
    }
    ctx.restore();

    if (style !== 'minimal') {
      ctx.save();
      roundRectPath(ctx, mx + 2, mediaTop + 2, mw - 4, mediaH - 4, radius);
      ctx.strokeStyle = theme.accent;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    if (textLines.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `700 ${textFontSize}px Inter, system-ui, sans-serif`;
      let ty = textPosition === 'above' ? areaTop + 44 : mediaTop + mediaH + 60;
      textLines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += textLineH; });
    }
  } else if (text) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${style === 'minimal' ? 48 : 46}px Inter, system-ui, sans-serif`;
    const lines = wrapLines(ctx, text, W - 150, 12);
    const blockH = lines.length * 62;
    let ty = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) + 46;
    lines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += 62; });
  }

  drawFooter(ctx, theme, footer, index, total);
};
