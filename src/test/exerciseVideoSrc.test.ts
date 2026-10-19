import { describe, it, expect } from 'vitest';
import { safeVideoSrc, splitRecognitionReps } from '@/lib/exerciseVideoSrc';

describe('safeVideoSrc', () => {
  it('extrai src do HTML de iframe do Cloudflare Stream', () => {
    const html = '<div style="position: relative;"><iframe src="https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&amp;loop=true"></iframe></div>';
    expect(safeVideoSrc(html)).toBe('https://customer-x.cloudflarestream.com/9e36735af82eee852d23dc9c13bfd238/iframe?muted=true&loop=true');
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
