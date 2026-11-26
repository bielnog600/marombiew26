import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Camera, Check, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import {
  STICKER_STYLES,
  STORY_HEIGHT,
  STORY_WIDTH,
  TAP_MAX_MOVE_PX,
  coverRect,
  dragStickerPosition,
  nextStickerStyle,
  pinchStickerScale,
  stickerStoryRect,
  type StickerStyle,
} from '@/lib/shareSticker';

const Y = '#F5C400';
const SHADOW = '0 2px 10px rgba(0,0,0,0.55)';
const WEEK = [
  { label: 'S', idx: 1 }, { label: 'T', idx: 2 }, { label: 'Q', idx: 3 }, { label: 'Q', idx: 4 },
  { label: 'S', idx: 5 }, { label: 'S', idx: 6 }, { label: 'D', idx: 0 },
];

export interface WorkoutStickerData {
  logoSrc: string;
  timeText: string;
  dayName: string;
  exercisesText: string;
  durationText: string;
  weekDays: boolean[];
}

export interface WorkoutStickerEditorHandle {
  /** PNG blob: 1080×1920 story with the photo, or transparent sticker when there is no photo. */
  exportImage: () => Promise<{ blob: Blob; withPhoto: boolean }>;
}

const glass: React.CSSProperties = {
  background: 'rgba(15,17,21,0.55)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.12)',
};

export const StickerArt: React.FC<{ style: StickerStyle; data: WorkoutStickerData }> = ({ style, data }) => {
  const time = (size: number) => (
    <div className="font-mono font-black tabular-nums leading-none" style={{ color: Y, fontSize: size, textShadow: '0 0 30px rgba(245,196,0,0.35), ' + SHADOW }}>
      {data.timeText}
    </div>
  );
  if (style === 'tempo') {
    return (
      <div data-testid="sticker-tempo" className="flex flex-col items-center text-center px-3 py-2" style={{ width: 220 }}>
        <div className="h-16 w-16 rounded-full overflow-hidden flex items-center justify-center mb-2" style={{ background: '#0F1115', border: `2px solid ${Y}` }}>
          <img src={data.logoSrc} alt="MAROMBIEW" className="h-14 w-14 object-contain" />
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] mb-1" style={{ color: '#fff', textShadow: SHADOW }}>Tempo Total</p>
        {time(56)}
        <p className="text-lg font-black mt-3 leading-tight" style={{ color: '#fff', textShadow: SHADOW }}>{data.dayName.toUpperCase()}</p>
        <div className="h-[2px] w-12 mt-3" style={{ background: Y }} />
      </div>
    );
  }
  if (style === 'mini') {
    return (
      <div data-testid="sticker-mini" className="rounded-2xl p-3" style={{ ...glass, width: 230 }}>
        <div className="flex items-center gap-2 mb-2">
          <img src={data.logoSrc} alt="MAROMBIEW" className="h-8 w-auto object-contain" />
          <div className="min-w-0">
            <div className="font-mono font-black tabular-nums leading-none" style={{ color: Y, fontSize: 28 }}>{data.timeText}</div>
            <p className="text-[11px] font-black truncate mt-1" style={{ color: '#fff' }}>{data.dayName.toUpperCase()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[['Exercícios', data.exercisesText], ['Duração', data.durationText]].map(([k, v]) => (
            <div key={k} className="rounded-xl p-2 text-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-base font-black" style={{ color: '#fff' }}>{v}</div>
              <div className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>{k}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (style === 'frequencia') {
    return (
      <div data-testid="sticker-frequencia" className="rounded-2xl p-3" style={{ ...glass, width: 250 }}>
        <div className="flex items-center gap-2 mb-2 justify-center">
          <img src={data.logoSrc} alt="MAROMBIEW" className="h-7 w-auto object-contain" />
          <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>Frequência da semana</p>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEK.map((d, i) => {
            const done = data.weekDays[d.idx];
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ background: done ? Y : 'transparent', border: done ? 'none' : '1.5px solid rgba(255,255,255,0.3)' }}>
                  {done && <Check className="h-4 w-4" style={{ color: '#0F1115' }} strokeWidth={3} />}
                </div>
                <span className="text-[9px] font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div data-testid="sticker-selo" className="flex flex-col items-center gap-2 p-2" style={{ width: 220 }}>
      <img src={data.logoSrc} alt="MAROMBIEW" className="h-24 w-auto object-contain" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }} />
      <div className="rounded-full px-4 py-2 font-black text-sm whitespace-nowrap" style={{ background: Y, color: '#0F1115' }}>
        TREINO FEITO · <span className="font-mono tabular-nums">{data.timeText}</span>
      </div>
    </div>
  );
};

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
        await toPng(art, opts); // first pass primes fonts/images
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
  }), [photoUrl, pos, scale]);

  const roundBtn = 'h-10 w-10 rounded-full flex items-center justify-center text-white';
  const roundStyle: React.CSSProperties = { background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' };

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
            <StickerArt style={style} data={data} />
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-1.5" aria-label="Estilo do sticker">
        {STICKER_STYLES.map((s) => (
          <span key={s} data-active={s === style} className="h-2 w-2 rounded-full" style={{ background: s === style ? Y : 'rgba(255,255,255,0.25)' }} />
        ))}
      </div>
      <p className="text-xs text-center text-muted-foreground">Arrasta e pinça o sticker. Toca nele pra trocar o estilo.</p>
    </div>
  );
});
WorkoutStickerEditor.displayName = 'WorkoutStickerEditor';
