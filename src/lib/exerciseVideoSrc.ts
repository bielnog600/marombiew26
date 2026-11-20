/**
 * Extrai uma URL de vídeo segura de `video_embed` (pode ser HTML de iframe ou URL).
 * Só aceita hosts conhecidos; nunca devolve URL relativa/do próprio app.
 */
const ALLOWED = [/(^|\.)cloudflarestream\.com$/i, /(^|\.)videodelivery\.net$/i, /(^|\.)youtube(-nocookie)?\.com$/i, /^youtu\.be$/i, /(^|\.)vimeo\.com$/i];

/** Parâmetros que o player do Cloudflare Stream precisa para tocar sozinho, em loop e sem som. */
export const STREAM_AUTOPLAY_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ['muted', 'true'],
  ['preload', 'true'],
  ['loop', 'true'],
  ['autoplay', 'true'],
];

/** Player do Cloudflare Stream: iframe.videodelivery.net/<id> ou customer-xxx.cloudflarestream.com/<id>/iframe. */
export function isCloudflareStreamPlayerUrl(value: string): boolean {
  try {
    const url = new URL(value.replace(/&amp;/g, '&'));
    if (url.protocol !== 'https:') return false;
    if (url.hostname.toLowerCase() === 'iframe.videodelivery.net') return /^\/[a-z0-9]+\/?$/i.test(url.pathname);
    if (/^customer-[a-z0-9]+\.cloudflarestream\.com$/i.test(url.hostname)) return /^\/[a-z0-9]+\/iframe\/?$/i.test(url.pathname);
    return false;
  } catch {
    return false;
  }
}

/**
 * Garante muted/preload/loop/autoplay no link do player do Cloudflare Stream,
 * acrescentando só os que faltarem (nada é duplicado nem reescrito). Outros links
 * voltam iguais. `ampersand` permite manter o `&amp;` de um atributo HTML.
 */
export function withStreamAutoplay(src: string, ampersand: '&' | '&amp;' = '&'): string {
  if (!src || !isCloudflareStreamPlayerUrl(src)) return src;
  const url = new URL(src.replace(/&amp;/g, '&'));
  const missing = STREAM_AUTOPLAY_PARAMS.filter(([key]) => !url.searchParams.has(key));
  if (missing.length === 0) return src;
  const hashAt = src.indexOf('#');
  const base = hashAt >= 0 ? src.slice(0, hashAt) : src;
  const hash = hashAt >= 0 ? src.slice(hashAt) : '';
  const extra = missing.map(([key, value]) => `${key}=${value}`).join(ampersand);
  const sep = !base.includes('?') ? '?' : /[?&]$/.test(base) || base.endsWith('&amp;') ? '' : ampersand;
  return `${base}${sep}${extra}${hash}`;
}

/**
 * Normaliza o embed salvo no cadastro de exercícios: no iframe (ou URL) do
 * Cloudflare Stream garante autoplay, loop e muted. O resto do HTML fica igual.
 */
export function normalizeVideoEmbed(embed: string | null | undefined): string {
  if (!embed || typeof embed !== 'string') return '';
  const raw = embed.trim();
  if (!raw) return '';
  if (!/<iframe/i.test(raw)) return withStreamAutoplay(raw);
  return raw.replace(/(<iframe\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/i, (_m, head: string, quote: string, src: string) =>
    `${head}${quote}${withStreamAutoplay(src, src.includes('&amp;') ? '&amp;' : '&')}${quote}`);
}

export function safeVideoSrc(embed: string | null | undefined): string | null {
  // Dados legados podem vir com tipo inesperado (objeto/number) — nunca quebrar o render.
  if (!embed || typeof embed !== 'string') return null;
  const raw = embed.trim();
  const fromIframe = raw.match(/src\s*=\s*["']([^"']+)["']/i)?.[1];
  const candidate = (fromIframe ?? raw).replace(/&amp;/g, '&');
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED.some(re => re.test(url.hostname))) return null;
    // Rede de segurança: registros antigos sem parâmetros também tocam sozinhos e em loop.
    return withStreamAutoplay(url.toString());
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
