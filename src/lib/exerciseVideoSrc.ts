/**
 * Extrai uma URL de vídeo segura de `video_embed` (pode ser HTML de iframe ou URL).
 * Só aceita hosts conhecidos; nunca devolve URL relativa/do próprio app.
 */
const ALLOWED = [/(^|\.)cloudflarestream\.com$/i, /(^|\.)videodelivery\.net$/i, /(^|\.)youtube(-nocookie)?\.com$/i, /^youtu\.be$/i, /(^|\.)vimeo\.com$/i];

export function safeVideoSrc(embed: string | null | undefined): string | null {
  // Dados legados podem vir com tipo inesperado (objeto/number) — nunca quebrar o render.
  if (!embed || typeof embed !== 'string') return null;
  const raw = embed.trim();
  const fromIframe = raw.match(/src\s*=\s*["']([^"']+)["']/i)?.[1];
  const candidate = (fromIframe ?? raw).replace(/&amp;/g, '&');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    return ALLOWED.some(re => re.test(url.hostname)) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "15 + 8-10" → reconhecimento "15", trabalho "8-10". Sem "+", ambos iguais. */
export function splitRecognitionReps(reps: string | null | undefined): { recognition: string; work: string } {
  const value = String(reps ?? '').trim();
  const parts = value.split('+').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { recognition: parts[0], work: parts[parts.length - 1] };
  return { recognition: value, work: value };
}
