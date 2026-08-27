// Renderizador de slides de carrossel (1080x1350) para a área Rede Social (admin).
import { drawCover, type ReelTheme } from './reelsRenderer';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export interface CarouselSlideDraw {
  theme: ReelTheme;
  logo?: HTMLImageElement | null;
  title: string;
  text?: string;
  media?: HTMLVideoElement | HTMLImageElement | null;
  footer?: string;
  index: number;
  total: number;
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

export const drawCarouselSlide = (ctx: CanvasRenderingContext2D, opts: CarouselSlideDraw) => {
  const { theme, logo, title, text, media, footer, index, total } = opts;
  const W = SLIDE_W;
  const H = SLIDE_H;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, theme.bg1);
  grad.addColorStop(1, theme.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Faixa de destaque
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

  let cursorY = 80;
  if (logo && logo.naturalWidth) {
    const logoW = 260;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, cursorY, logoW, logoH);
    cursorY += logoH + 26;
  } else {
    cursorY += 30;
  }

  // Título
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.text;
  ctx.font = '900 72px Inter, system-ui, sans-serif';
  const titleLines = wrapLines(ctx, (title || '').toUpperCase(), W - 130, 3);
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, cursorY + 66 + i * 80));
  cursorY += titleLines.length ? 66 + titleLines.length * 80 : 20;

  const bottomReserved = 130;
  const areaTop = cursorY + 24;
  const areaBottom = H - bottomReserved;

  if (media) {
    const textLinesCount = text ? 4 : 0;
    const textBlockH = textLinesCount ? 40 + textLinesCount * 48 : 0;
    const mediaH = Math.max(260, areaBottom - areaTop - textBlockH);
    const mx = 60;
    const mw = W - 120;
    ctx.save();
    roundRectPath(ctx, mx, areaTop, mw, mediaH, 36);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(mx, areaTop, mw, mediaH);
    drawCover(ctx, media, mx, areaTop, mw, mediaH);
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, mx + 2, areaTop + 2, mw - 4, mediaH - 4, 36);
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    if (text) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 38px Inter, system-ui, sans-serif';
      const lines = wrapLines(ctx, text, W - 140, 4);
      let ty = areaTop + mediaH + 60;
      lines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += 48; });
    }
  } else if (text) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 46px Inter, system-ui, sans-serif';
    const lines = wrapLines(ctx, text, W - 150, 12);
    const blockH = lines.length * 62;
    let ty = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) + 46;
    lines.forEach((line) => { ctx.fillText(line, W / 2, ty); ty += 62; });
  }

  // Rodapé + paginação
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.font = '900 32px Inter, system-ui, sans-serif';
  ctx.fillText(`${index + 1}/${total}`, W / 2, H - 84);
  if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 34px Inter, system-ui, sans-serif';
    ctx.fillText(footer.toUpperCase(), W / 2, H - 36);
  }
  ctx.restore();
};
