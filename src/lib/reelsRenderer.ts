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

export interface DrawReelFrameOptions {
  theme: ReelTheme;
  logo?: HTMLImageElement | null;
  title: string;
  cta?: string;
  footer?: string;
  items: ReelExerciseItem[]; // até 4 (grade 2x2)
  background?: HTMLVideoElement | HTMLImageElement | null;
  pageLabel?: string;
  time: number; // segundos, para animações sutis
}

export const drawReelFrame = (ctx: CanvasRenderingContext2D, opts: DrawReelFrameOptions) => {
  const { theme, logo, title, cta, footer, items, background, pageLabel, time } = opts;
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
    ctx.fillText(String(index + 1), x + 20 + badge / 2, y + 20 + badge / 2 + 2);
    ctx.restore();

    // Texto do exercício
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.font = '900 40px Inter, system-ui, sans-serif';
    const nameLines = wrapLines(ctx, item.name.toUpperCase(), cellW - 56, 2);
    let ty = y + cellH - 40 - (item.sub ? 84 : 46) - (nameLines.length - 1) * 46;
    nameLines.forEach((line) => {
      ctx.fillText(line, x + 28, ty);
      ty += 46;
    });
    ctx.fillStyle = theme.accent;
    ctx.font = '900 42px Inter, system-ui, sans-serif';
    ctx.fillText(item.detail, x + 28, ty + 8);
    if (item.sub) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '700 30px Inter, system-ui, sans-serif';
      ctx.fillText(item.sub, x + 28, ty + 50);
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