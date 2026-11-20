import { describe, it, expect } from 'vitest';
import { safeVideoSrc, splitRecognitionReps, normalizeVideoEmbed, withStreamAutoplay } from '@/lib/exerciseVideoSrc';

describe('safeVideoSrc', () => {
  it('extrai src do HTML de iframe do Cloudflare Stream', () => {
    const html = '<div style="position: relative;"><iframe src="https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&amp;loop=true"></iframe></div>';
    expect(safeVideoSrc(html)).toBe('https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&loop=true&preload=true&autoplay=true');
  });
  it('nunca quebra com valores não-string legados (objeto, number)', () => {
    expect(safeVideoSrc(null)).toBeNull();
    expect(safeVideoSrc(undefined)).toBeNull();
    expect(safeVideoSrc({ src: 'https://x.cloudflarestream.com/a' } as any)).toBeNull();
    expect(safeVideoSrc(123 as any)).toBeNull();
  });
  it('rejeita URL relativa, do próprio app ou host desconhecido', () => {
    expect(safeVideoSrc('/treino')).toBeNull();
    expect(safeVideoSrc('undefined')).toBeNull();
    expect(safeVideoSrc('https://marombiew26.lovable.app/x')).toBeNull();
    expect(safeVideoSrc('')).toBeNull();
  });
});

describe('splitRecognitionReps', () => {
  it('separa "15 + 8-10" em reconhecimento 15 e trabalho 8-10', () => {
    expect(splitRecognitionReps('15 + 8-10')).toEqual({ recognition: '15', work: '8-10' });
  });
});

const UPLOAD_EMBED = '<iframe src="https://iframe.videodelivery.net/a7d39fb5ab9585c4b73d4e4febbf785e" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%;" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen="true"></iframe>';

describe('vídeo do Cloudflare Stream sempre com autoplay, loop e muted', () => {
  it('embed novo do upload (iframe.videodelivery.net/<id> sem parâmetros) ganha os 4 parâmetros', () => {
    const out = normalizeVideoEmbed(UPLOAD_EMBED);
    expect(out).toContain('src="https://iframe.videodelivery.net/a7d39fb5ab9585c4b73d4e4febbf785e?muted=true&preload=true&loop=true&autoplay=true"');
    // O resto do HTML fica igual.
    expect(out.replace('?muted=true&preload=true&loop=true&autoplay=true', '')).toBe(UPLOAD_EMBED);
  });
  it('customer-xxx.cloudflarestream.com/<id>/iframe: só acrescenta os que faltam, sem duplicar', () => {
    const src = 'https://customer-vqfal80lir76xyf0.cloudflarestream.com/3dd16dde83f6d33875aebab4190e1b03/iframe?loop=true&poster=https%3A%2F%2Fx.jpg';
    expect(withStreamAutoplay(src)).toBe(`${src}&muted=true&preload=true&autoplay=true`);
  });
  it('embed que já tem tudo volta idêntico (salvar de novo não duplica)', () => {
    const once = normalizeVideoEmbed(UPLOAD_EMBED);
    expect(normalizeVideoEmbed(once)).toBe(once);
  });
  it('mantém o &amp; quando o atributo do iframe já o usa', () => {
    const html = '<iframe src="https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&amp;loop=true"></iframe>';
    expect(normalizeVideoEmbed(html)).toBe('<iframe src="https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&amp;loop=true&amp;preload=true&amp;autoplay=true"></iframe>');
  });
  it('URL colada direto também é normalizada; outros sites e vazio não mudam', () => {
    expect(normalizeVideoEmbed('https://iframe.videodelivery.net/abc123')).toBe('https://iframe.videodelivery.net/abc123?muted=true&preload=true&loop=true&autoplay=true');
    expect(normalizeVideoEmbed('https://www.youtube.com/embed/xyz')).toBe('https://www.youtube.com/embed/xyz');
    expect(normalizeVideoEmbed('https://customer-x.cloudflarestream.com/abc/manifest/video.m3u8')).toBe('https://customer-x.cloudflarestream.com/abc/manifest/video.m3u8');
    expect(normalizeVideoEmbed('   ')).toBe('');
  });
  it('fallback na exibição: registro antigo sem parâmetros toca sozinho e em loop', () => {
    expect(safeVideoSrc(UPLOAD_EMBED)).toBe('https://iframe.videodelivery.net/a7d39fb5ab9585c4b73d4e4febbf785e?muted=true&preload=true&loop=true&autoplay=true');
  });
});
