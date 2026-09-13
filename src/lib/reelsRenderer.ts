// Renderizador de "Reels" 1080x1920 em canvas para a área Rede Social (admin).
// Desenha: logo no topo centralizado, título, e grade 2x2 de exercícios
// (vídeo/imagem + nome + séries/reps), sobre um background opcional.

export const REEL_W = 1080;
export const REEL_H = 1920;

export interface ReelExerciseItem {
  name: string;
  detail: string;
  sub?: string;
  media?: HTMLVideoElement | HTMLImageElement | null;
}

export interface ReelTheme {
  accent: string;
  accent2: string;
  text: string;
  bg1: string;
  bg2: string;
}

export const REEL_THEMES: Record<string, ReelTheme> = {
  ouro: { accent: '#FFC400', accent2: '#FF7A00', text: '#FFFFFF', bg1: '#0F1115', bg2: '#1B1F27' },
  neon: { accent: '#39FF14', accent2: '#00E0FF', text: '#FFFFFF', bg1: '#050B0A', bg2: '#0C1F1A' },
  fogo: { accent: '#FF3D3D', accent2: '#FF9A00', text: '#FFFFFF', bg1: '#140606', bg2: '#2A0A0A' },
  gelo: { accent: '#5CE1FF', accent2: '#7A5CFF', text: '#FFFFFF', bg1: '#060A14', bg2: '#101A2E' },
};

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

const mediaSize = (media: HTMLVideoElement | HTMLImageElement) => {
  if (media instanceof HTMLVideoElement) return { w: media.videoWidth, h: media.videoHeight };
  return { w: media.naturalWidth, h: media.naturalHeight };
};

export const drawCover = (
  ctx: CanvasRenderingContext2D,
  media: HTMLVideoElement | HTMLImageElement,
  x: number, y: number, w: number, h: number,
) => {
  const { w: mw, h: mh } = mediaSize(media);
  if (!mw || !mh) return false;
  const scale = Math.max(w / mw, h / mh);
  const dw = mw * scale;
  const dh = mh * scale;
  ctx.drawImage(media, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  return true;
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
    if (words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = `${last.trim()}…`;
  }
  return lines;
};

export type ReelStyle = 'premium' | 'classic';

export interface DrawReelFrameOptions {
  theme: ReelTheme;
  style?: ReelStyle;
  logo?: HTMLImageElement | null;
  title: string;
  cta?: string;
  footer?: string;
  items: ReelExerciseItem[]; // até 4 (grade 2x2)
  background?: HTMLVideoElement | HTMLImageElement | null;
  startIndex?: number; // deslocamento da numeração (parte 2 começa em 5)
  pageLabel?: string;
  time: number; // segundos, para animações sutis
}

export const drawClassicReelFrame = (ctx: CanvasRenderingContext2D, opts: DrawReelFrameOptions) => {
  const { theme, logo, title, cta, footer, items, background, pageLabel, time } = opts;
  const startIndex = opts.startIndex ?? 0;
  const W = REEL_W;
  const H = REEL_H;

  // Background
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, theme.bg1);
  grad.addColorStop(1, theme.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  if (background) {
    drawCover(ctx, background, 0, 0, W, H);
    ctx.fillStyle = 'rgba(6,8,12,0.62)';
    ctx.fillRect(0, 0, W, H);
  }
  // Faixa diagonal de destaque
  ctx.globalAlpha = 0.16;
  const stripe = ctx.createLinearGradient(0, H * 0.15, W, H * 0.55);
  stripe.addColorStop(0, theme.accent);
  stripe.addColorStop(1, theme.accent2);
  ctx.fillStyle = stripe;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.30);
  ctx.lineTo(W, H * 0.18);
  ctx.lineTo(W, H * 0.26);
  ctx.lineTo(0, H * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Logo topo centralizado
  let cursorY = 120;
  if (logo && logo.naturalWidth) {
    const logoW = 340;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, cursorY, logoW, logoH);
    cursorY += logoH + 40;
  } else {
    cursorY += 40;
  }

  // Título
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.text;
  ctx.font = '900 84px Inter, system-ui, sans-serif';
  const titleLines = wrapLines(ctx, title.toUpperCase(), W - 140, 2);
  titleLines.forEach((line, i) => {
    ctx.fillText(line, W / 2, cursorY + 70 + i * 92);
  });
  cursorY += 70 + titleLines.length * 92;

  if (cta) {
    // CTA como badge chamativo (estilo botão)
    ctx.save();
    ctx.font = '900 38px Inter, system-ui, sans-serif';
    const ctaText = cta.toUpperCase();
    const padX = 48;
    const padY = 22;
    const textW = ctx.measureText(ctaText).width;
    const badgeW = textW + padX * 2;
    const badgeH = 66;
    const bx = (W - badgeW) / 2;
    const by = cursorY + 6;

    // Sombra/glow pulsante
    const pulse = 0.55 + Math.sin(time * 4) * 0.25;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 24 + pulse * 18;

    // Fundo do badge com gradiente
    const bgGrad = ctx.createLinearGradient(bx, by, bx + badgeW, by + badgeH);
    bgGrad.addColorStop(0, theme.accent);
    bgGrad.addColorStop(1, theme.accent2);
    ctx.fillStyle = bgGrad;
    roundRectPath(ctx, bx, by, badgeW, badgeH, 24);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0B0D12';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaText, W / 2, by + badgeH / 2 + 2);
    ctx.restore();
    cursorY += 90;
  }

  // Grade 2x2
  const padX = 60;
  const gap = 36;
  const cellW = (W - padX * 2 - gap) / 2;
  const gridTop = Math.max(cursorY + 30, 620);
  const gridBottom = H - 180;
  const cellH = (gridBottom - gridTop - gap) / 2;

  items.slice(0, 4).forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = padX + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);

    ctx.save();
    roundRectPath(ctx, x, y, cellW, cellH, 40);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, cellW, cellH);
    if (item.media) drawCover(ctx, item.media, x, y, cellW, cellH);

    // Gradiente inferior para leitura do texto
    const g = ctx.createLinearGradient(0, y + cellH * 0.4, 0, y + cellH);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y + cellH * 0.4, cellW, cellH * 0.6);
    ctx.restore();

    // Borda
    ctx.save();
    roundRectPath(ctx, x + 2, y + 2, cellW - 4, cellH - 4, 40);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.restore();

    // Número do exercício
    ctx.save();
    const badge = 66;
    roundRectPath(ctx, x + 20, y + 20, badge, badge, 22);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.fillStyle = '#0B0D12';
    ctx.font = '900 38px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(startIndex + index + 1), x + 20 + badge / 2, y + 20 + badge / 2 + 2);
    ctx.restore();

    // Texto do exercício
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.font = '900 34px Inter, system-ui, sans-serif';
    const nameLines = wrapLines(ctx, item.name.toUpperCase(), cellW - 56, 2);
    let ty = y + cellH - 40 - (item.sub ? 80 : 44) - (nameLines.length - 1) * 40;
    nameLines.forEach((line) => {
      ctx.fillText(line, x + 28, ty);
      ty += 40;
    });
    ctx.fillStyle = theme.accent;
    ctx.font = '900 36px Inter, system-ui, sans-serif';
    ctx.fillText(item.detail, x + 28, ty + 8);
    if (item.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '700 26px Inter, system-ui, sans-serif';
      ctx.fillText(item.sub, x + 28, ty + 46);
    }
    ctx.restore();
  });

  // Rodapé
  ctx.save();
  ctx.textAlign = 'center';
  const pulse = 0.75 + Math.sin(time * 3) * 0.25;
  if (pageLabel) {
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = pulse;
    ctx.font = '900 34px Inter, system-ui, sans-serif';
    ctx.fillText(pageLabel.toUpperCase(), W / 2, H - 116);
    ctx.globalAlpha = 1;
  }
  if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 36px Inter, system-ui, sans-serif';
    ctx.fillText(footer.toUpperCase(), W / 2, H - 56);
  }
  ctx.restore();
};

const premiumRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const premiumWrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) => {
  const words = text.split(/\\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
};

const getPremiumReelRects = (count: number, x: number, y: number, w: number, h: number) => {
  const gap = 28;
  if (count <= 1) return [{ x, y: y + 30, w, h: Math.min(h - 60, 690) }];
  if (count === 2) {
    const cardW = (w - gap) / 2;
    return [{ x, y: y + 70, w: cardW, h: Math.min(h - 140, 760) }, { x: x + cardW + gap, y: y + 70, w: cardW, h: Math.min(h - 140, 760) }];
  }
  const cardW = (w - gap) / 2;
  const cardH = (h - gap) / 2;
  if (count === 3) return [
    { x, y, w: cardW, h: cardH },
    { x: x + cardW + gap, y, w: cardW, h: cardH },
    { x: x + (w - cardW) / 2, y: y + cardH + gap, w: cardW, h: cardH },
  ];
  return Array.from({ length: 4 }, (_, index) => ({
    x: x + (index % 2) * (cardW + gap),
    y: y + Math.floor(index / 2) * (cardH + gap),
    w: cardW,
    h: cardH,
  }));
};

const drawPremiumTitle = (ctx: CanvasRenderingContext2D, title: string, theme: ReelTheme, y: number) => {
  ctx.font = '900 78px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  const lines = premiumWrap(ctx, title.toUpperCase(), REEL_W - 140, 2);
  lines.forEach((line, index) => {
    const words = line.split(' ');
    const highlight = words.pop() ?? '';
    const base = words.join(' ');
    const baseWidth = ctx.measureText(base).width;
    const highlightWidth = ctx.measureText(highlight).width;
    const start = (REEL_W - baseWidth - highlightWidth - (base ? 18 : 0)) / 2;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    if (base) ctx.fillText(base, start, y + index * 86);
    ctx.fillStyle = theme.accent;
    ctx.fillText(highlight, start + baseWidth + (base ? 18 : 0), y + index * 86);
  });
  return lines.length;
};

const drawPremiumReelFrame = (ctx: CanvasRenderingContext2D, opts: DrawReelFrameOptions) => {
  const { theme, logo, title, cta, footer, items, background, time } = opts;
  const startIndex = opts.startIndex ?? 0;
  const pageLabel = opts.pageLabel;
  const pageCount = pageLabel?.match(/\\d+/g)?.map(Number) ?? [];
  const page = pageCount[0] ?? 1;
  const totalPages = pageCount[1] ?? 1;
  const W = REEL_W;
  const H = REEL_H;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, theme.bg1);
  bg.addColorStop(0.55, '#080a0f');
  bg.addColorStop(1, theme.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  const glow = ctx.createRadialGradient(W * 0.78, 170, 0, W * 0.78, 170, 620);
  glow.addColorStop(0, `${theme.accent}22`);
  glow.addColorStop(1, `${theme.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 140) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  if (background) {
    drawCover(ctx, background, 0, 0, W, H);
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(5,7,10,0.58)');
    scrim.addColorStop(0.5, 'rgba(5,7,10,0.38)');
    scrim.addColorStop(1, 'rgba(5,7,10,0.68)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
  }

  const topY = 88;
  const lineY = 132;
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.78;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, lineY);
  ctx.lineTo(330, lineY);
  ctx.moveTo(W - 330, lineY);
  ctx.lineTo(W - 72, lineY);
  ctx.stroke();
  ctx.globalAlpha = 1;

  let cursorY = topY;
  if (logo?.naturalWidth) {
    const logoW = 250;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    ctx.drawImage(logo, (W - logoW) / 2, cursorY, logoW, logoH);
    cursorY += logoH + 62;
  }

  const titleLines = drawPremiumTitle(ctx, title || 'TREINO', theme, cursorY + 76);
  cursorY += titleLines * 86 + 42;

  if (cta) {
    ctx.save();
    ctx.font = '800 30px Inter, system-ui, sans-serif';
    const label = cta.toUpperCase();
    const pillW = Math.min(W - 180, ctx.measureText(label).width + 68);
    const pillH = 58;
    const px = (W - pillW) / 2;
    const py = cursorY;
    const pulse = 0.18 + Math.sin(time * 2.4) * 0.04;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 12 + pulse * 10;
    premiumRoundRect(ctx, px, py, pillW, pillH, 29);
    ctx.fillStyle = 'rgba(8,10,15,0.76)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, W / 2, py + pillH / 2 + 1);
    ctx.restore();
    cursorY += pillH + 38;
  }

  const gridTop = Math.max(cursorY + 28, 535);
  const gridBottom = H - 205;
  const rects = getPremiumReelRects(Math.min(items.length, 4), 62, gridTop, W - 124, gridBottom - gridTop);
  items.slice(0, 4).forEach((item, index) => {
    const rect = rects[index];
    if (!rect) return;
    const entry = Math.min(1, Math.max(0, (time % 5) / 0.35 - index * 0.06));
    const offsetY = (1 - entry) * 12;
    const x = rect.x;
    const y = rect.y + offsetY;
    ctx.save();
    ctx.shadowColor = `${theme.accent}35`;
    ctx.shadowBlur = 18 + Math.sin(time * 2 + index) * 3;
    premiumRoundRect(ctx, x, y, rect.w, rect.h, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    premiumRoundRect(ctx, x, y, rect.w, rect.h, 32);
    ctx.clip();
    if (item.media) drawCover(ctx, item.media, x, y, rect.w, rect.h);
    else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x, y, rect.w, rect.h);
      ctx.fillStyle = theme.accent;
      ctx.font = '900 56px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', x + rect.w / 2, y + rect.h / 2);
    }
    const shade = ctx.createLinearGradient(0, y + rect.h * 0.38, 0, y + rect.h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, rect.w, rect.h);
    ctx.restore();

    ctx.save();
    premiumRoundRect(ctx, x + 2, y + 2, rect.w - 4, rect.h - 4, 30);
    ctx.strokeStyle = theme.accent;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const badgeW = 68;
    const badgeH = 48;
    premiumRoundRect(ctx, x + 18, y + 18, badgeW, badgeH, 18);
    ctx.fillStyle = 'rgba(8,10,15,0.84)';
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = theme.accent;
    ctx.font = '900 25px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(startIndex + index + 1).padStart(2, '0'), x + 52, y + 42);
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.font = '900 30px Inter, system-ui, sans-serif';
    const nameLines = premiumWrap(ctx, item.name.toUpperCase(), rect.w - 44, 2);
    const detailSpace = item.sub ? 72 : 42;
    let textY = y + rect.h - detailSpace - (nameLines.length - 1) * 34 - 28;
    nameLines.forEach((line) => { ctx.fillText(line, x + 22, textY); textY += 34; });
    ctx.fillStyle = theme.accent;
    ctx.font = '900 29px Inter, system-ui, sans-serif';
    ctx.fillText(item.detail, x + 22, textY + 8);
    if (item.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.font = '700 22px Inter, system-ui, sans-serif';
      ctx.fillText(item.sub, x + 22, textY + 40);
    }
    ctx.restore();
  });

  ctx.save();
  ctx.strokeStyle = `${theme.accent}80`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(62, H - 132);
  ctx.lineTo(W - 62, H - 132);
  ctx.stroke();
  ctx.font = '800 24px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.textAlign = 'left';
  ctx.fillText((footer || '@marombiew').toUpperCase(), 62, H - 82);
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.accent;
  ctx.fillText(`${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, W / 2, H - 82);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText('TREINE • EVOLUA', W - 62, H - 82);
  ctx.restore();
};

export const drawReelFrame = (ctx: CanvasRenderingContext2D, opts: DrawReelFrameOptions) => {
  if ((opts.style ?? 'classic') === 'premium') {
    drawPremiumReelFrame(ctx, opts);
    return;
  }
  drawClassicReelFrame(ctx, opts);
};

export const pickRecorderMime = () => {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
};