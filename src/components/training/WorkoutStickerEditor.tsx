import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Camera, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import {
  STICKER_PRESETS,
  STORY_HEIGHT,
  STORY_WIDTH,
  TAP_MAX_MOVE_PX,
  coverRect,
  dragStickerPosition,
  nextStickerStyle,
  pinchStickerScale,
  stickerStoryRect,
  type StickerBackground,
  type StickerLogoSize,
  type StickerStyle,
} from '@/lib/shareSticker';
import { StickerArt, type WorkoutStickerData } from '@/components/training/StickerArt';

const Y = '#F5C400';

export type { WorkoutStickerData } from '@/components/training/StickerArt';
export { StickerArt } from '@/components/training/StickerArt';

export interface WorkoutStickerEditorHandle {
  /** PNG blob: 1080×1920 story with the photo, or transparent sticker when there is no photo. */
  exportImage: () => Promise<{ blob: Blob; withPhoto: boolean }>;
}

const waitForAssets = async (root: HTMLElement) => {
  try { await (document as any).fonts?.ready; } catch { /* ignore */ }
  await Promise.all(Array.from(root.querySelectorAll('img')).map((img) =>
    img.complete && img.naturalWidth > 0
      ? img.decode().catch(() => undefined)
      : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); setTimeout(r, 4000); })));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const dataUrlToBlob = async (url: string) => (await fetch(url)).blob();

export const WorkoutStickerEditor = forwardRef<WorkoutStickerEditorHandle, { data: WorkoutStickerData }>(({ data }, ref) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<StickerStyle>('tempo');
  const [logoSize, setLogoSize] = useState<StickerLogoSize>('M');
  const [background, setBackground] = useState<StickerBackground>('transparente');
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [scale, setScale] = useState(1);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startPos: { x: number; y: number }; startScale: number; startDist: number; ox: number; oy: number; moved: boolean; multi: boolean } | null>(null);

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhotoUrl(URL.createObjectURL(f)); // stays on the device, never uploaded
  };

  const dist = () => {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const multi = pointers.current.size > 1;
    gesture.current = { startPos: pos, startScale: scale, startDist: dist(), ox: e.clientX, oy: e.clientY, moved: gesture.current?.moved ?? false, multi: multi || (gesture.current?.multi ?? false) };
    if (!multi) gesture.current.moved = false, gesture.current.multi = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = areaRef.current?.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      g.moved = true;
      setScale(pinchStickerScale(g.startScale, g.startDist, dist()));
      return;
    }
    const dx = e.clientX - g.ox;
    const dy = e.clientY - g.oy;
    if (Math.hypot(dx, dy) > TAP_MAX_MOVE_PX) g.moved = true;
    if (g.moved && rect) setPos(dragStickerPosition(g.startPos, dx, dy, rect));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1 && g) {
      // continue dragging with the remaining finger from the current position
      const [p] = Array.from(pointers.current.values());
      gesture.current = { ...g, startPos: pos, startScale: scale, ox: p.x, oy: p.y };
      return;
    }
    if (pointers.current.size === 0) {
      if (g && !g.moved && !g.multi) setStyle((s) => nextStickerStyle(s));
      gesture.current = null;
    }
  };

  useImperativeHandle(ref, () => ({
    exportImage: async () => {
      const art = artRef.current;
      const area = areaRef.current;
      if (!art || !area) throw new Error('Sticker indisponível');
      await waitForAssets(art);
      const w = art.offsetWidth;
      const h = art.offsetHeight;
      const previewW = area.clientWidth || 360;
      if (!photoUrl) {
        const opts = { cacheBust: true, pixelRatio: 4, width: w, height: h };
        await toPng(art, opts); // first pass primes fonts/images and preserves the inline logo drop-shadow
        const url = await toPng(art, opts);
        return { blob: await dataUrlToBlob(url), withPhoto: false };
      }
      const ratio = (STORY_WIDTH / previewW) * scale;
      const opts = { cacheBust: true, pixelRatio: Math.max(2, ratio), width: w, height: h };
      await toPng(art, opts);
      const stickerUrl = await toPng(art, opts);
      const [photo, sticker] = await Promise.all([loadImage(photoUrl), loadImage(stickerUrl)]);
      const canvas = document.createElement('canvas');
      canvas.width = STORY_WIDTH;
      canvas.height = STORY_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      ctx.imageSmoothingQuality = 'high';
      const c = coverRect(photo.naturalWidth, photo.naturalHeight, STORY_WIDTH, STORY_HEIGHT);
      ctx.drawImage(photo, c.x, c.y, c.w, c.h);
      const r = stickerStoryRect(pos, scale, { width: w, height: h }, previewW);
      ctx.drawImage(sticker, r.x, r.y, r.w, r.h);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('Falha ao gerar imagem');
      return { blob, withPhoto: true };
    },
  }), [photoUrl, pos, scale, style, logoSize, background]);

  const roundBtn = 'h-10 w-10 rounded-full flex items-center justify-center text-white';
  const roundStyle: React.CSSProperties = { background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' };
  const hasLogo = style !== 'marca-dagua';

  return (
    <div className="w-full max-w-[360px] space-y-3">
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} data-testid="sticker-camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="sticker-gallery-input" />
      <div
        ref={areaRef}
        data-testid="sticker-area"
        className="relative w-full overflow-hidden rounded-3xl select-none"
        style={{
          aspectRatio: '9/16',
          touchAction: 'none',
          ...(photoUrl ? { background: '#000' } : {
            backgroundColor: '#2a2d35',
            backgroundImage: 'linear-gradient(45deg,#3a3e48 25%,transparent 25%),linear-gradient(-45deg,#3a3e48 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3e48 75%),linear-gradient(-45deg,transparent 75%,#3a3e48 75%)',
            backgroundSize: '24px 24px',
            backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
          }),
        }}
      >
        {photoUrl && <img src={photoUrl} alt="Sua foto" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
        {photoUrl ? (
          <div className="absolute top-3 right-3 z-10 flex gap-2">
            <button type="button" aria-label="Trocar foto" className={roundBtn} style={roundStyle} onClick={() => galleryRef.current?.click()}><RefreshCw className="h-4 w-4" /></button>
            <button type="button" aria-label="Remover foto" className={roundBtn} style={roundStyle} onClick={() => setPhotoUrl(null)}><Trash2 className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="absolute bottom-4 inset-x-0 z-10 flex justify-center gap-2">
            <button type="button" className="h-10 px-4 rounded-full text-sm font-semibold text-white flex items-center gap-2" style={roundStyle} onClick={() => cameraRef.current?.click()}><Camera className="h-4 w-4" />Tirar foto</button>
            <button type="button" className="h-10 px-4 rounded-full text-sm font-semibold text-white flex items-center gap-2" style={roundStyle} onClick={() => galleryRef.current?.click()}><ImageIcon className="h-4 w-4" />Galeria</button>
          </div>
        )}
        <div
          data-testid="sticker"
          data-style={style}
          data-scale={scale.toFixed(2)}
          className="absolute cursor-grab"
          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: `translate(-50%, -50%) scale(${scale})`, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div ref={artRef} style={{ background: 'transparent' }}>
            <StickerArt style={style} data={data} logoSize={logoSize} background={background} />
          </div>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">Modelo do sticker</p>
        <div aria-label="Modelos de sticker" className="flex gap-2 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {STICKER_PRESETS.map((preset) => {
            const active = preset.value === style;
            return (
              <button
                key={preset.value}
                type="button"
                aria-label={`Modelo ${preset.label}`}
                aria-pressed={active}
                onClick={() => setStyle(preset.value)}
                className="shrink-0 w-[88px] h-[88px] rounded-xl border transition-colors overflow-hidden"
                style={{
                  borderColor: active ? Y : 'rgba(255,255,255,0.12)',
                  background: active ? 'rgba(245,196,0,0.10)' : 'rgba(255,255,255,0.04)',
                  boxShadow: active ? '0 0 0 1px rgba(245,196,0,0.22)' : 'none',
                }}
              >
                <span className="relative block h-[58px] w-full overflow-hidden pointer-events-none" aria-hidden="true">
                  <span className="absolute left-1/2 top-1/2 block w-max" style={{ transform: 'translate(-50%, -50%) scale(0.18)' }}>
                    <StickerArt style={preset.value} data={data} logoSize={logoSize} background={background} thumbnail />
                  </span>
                </span>
                <span className="block px-1 text-[9px] font-bold leading-[1.1]" style={{ color: active ? Y : 'rgba(255,255,255,0.72)' }}>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Tamanho da logo</p>
          <div role="group" aria-label="Tamanho da logo" className="flex rounded-lg p-1 bg-card border border-border" style={{ opacity: hasLogo ? 1 : 0.45 }}>
            {(['P', 'M', 'G'] as const).map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={logoSize === size}
                disabled={!hasLogo}
                onClick={() => setLogoSize(size)}
                className="flex-1 h-8 rounded-md text-xs font-black"
                style={{ background: logoSize === size ? Y : 'transparent', color: logoSize === size ? '#0F1115' : 'rgba(255,255,255,0.68)' }}
              >{size}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">Fundo do sticker</p>
          <div role="group" aria-label="Fundo do sticker" className="flex rounded-lg p-1 bg-card border border-border">
            {([{ value: 'transparente', label: 'Transparente' }, { value: 'vidro', label: 'Vidro escuro' }] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={background === option.value}
                onClick={() => setBackground(option.value)}
                className="flex-1 h-8 rounded-md text-[9px] font-bold px-1"
                style={{ background: background === option.value ? Y : 'transparent', color: background === option.value ? '#0F1115' : 'rgba(255,255,255,0.68)' }}
              >{option.label}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-center text-muted-foreground">Arrasta e pinça o sticker. Toca nele pra trocar o estilo.</p>
    </div>
  );
});
WorkoutStickerEditor.displayName = 'WorkoutStickerEditor';
