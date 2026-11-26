import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

vi.mock('html-to-image', () => ({ toPng: vi.fn(async () => 'data:image/png;base64,AAAA') }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { toPng } from 'html-to-image';
import { WorkoutSummaryShare } from '@/components/training/WorkoutSummaryShare';
import { WorkoutStickerEditor, type WorkoutStickerEditorHandle } from '@/components/training/WorkoutStickerEditor';
import {
  clampStickerScale, coverRect, dragStickerPosition, nextStickerStyle, pinchStickerScale, stickerStoryRect,
} from '@/lib/shareSticker';

class FakePointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: any = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
}
(globalThis as any).PointerEvent = FakePointerEvent;
Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 100 });
(HTMLImageElement.prototype as any).decode = () => Promise.resolve();

const data = { logoSrc: 'logo.png', timeText: '00:07', dayName: 'Quarta', exercisesText: '0/9', durationText: '1 min', weekDays: [false, false, false, true, false, false, false] };

describe('share sticker rules', () => {
  it('cycles the 4 styles', () => {
    expect(nextStickerStyle('tempo')).toBe('mini');
    expect(nextStickerStyle('mini')).toBe('frequencia');
    expect(nextStickerStyle('frequencia')).toBe('selo');
    expect(nextStickerStyle('selo')).toBe('tempo');
  });
  it('clamps scale to 0.5–2.5', () => {
    expect(clampStickerScale(0.1)).toBe(0.5);
    expect(clampStickerScale(9)).toBe(2.5);
    expect(pinchStickerScale(1, 100, 200)).toBe(2);
    expect(pinchStickerScale(2, 100, 300)).toBe(2.5);
  });
  it('drags as a fraction of the preview and stays inside', () => {
    expect(dragStickerPosition({ x: 0.5, y: 0.5 }, 36, -64, { width: 360, height: 640 })).toEqual({ x: 0.6, y: 0.4 });
    expect(dragStickerPosition({ x: 0.9, y: 0.5 }, 360, 0, { width: 360, height: 640 }).x).toBe(1);
  });
  it('maps preview geometry onto the 1080×1920 story', () => {
    expect(stickerStoryRect({ x: 0.5, y: 0.5 }, 2, { width: 100, height: 50 }, 360)).toEqual({ x: 240, y: 810, w: 600, h: 300 });
    expect(coverRect(1000, 1000, 1080, 1920)).toEqual({ x: -420, y: 0, w: 1920, h: 1920 });
  });
});

describe('WorkoutSummaryShare', () => {
  const props = { dayName: 'Quarta', durationSeconds: 7, exercisesCompleted: 0, totalExercises: 9, phase: null, onClose: () => {} };
  it('keeps the card unchanged and opens on Card', () => {
    const { container } = render(<WorkoutSummaryShare {...props} />);
    expect(screen.getByRole('tab', { name: 'Card' })).toHaveAttribute('aria-selected', 'true');
    const card = screen.getByText('Tempo Total').closest('.rounded-3xl')!.parentElement!;
    const html = card.innerHTML.replace(/\d{2} de [a-zç]+ de \d{4}/g, 'DATE');
    expect(html).toMatchSnapshot();
  });
  it('switches to the Sticker tab', () => {
    render(<WorkoutSummaryShare {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sticker' }));
    expect(screen.getByText('Arrasta e pinça o sticker. Toca nele pra trocar o estilo.')).toBeInTheDocument();
    expect(screen.getByTestId('sticker-camera-input')).toHaveAttribute('capture', 'user');
  });
});

describe('WorkoutStickerEditor', () => {
  const area = () => {
    const el = screen.getByTestId('sticker-area');
    el.getBoundingClientRect = () => ({ width: 360, height: 640, left: 0, top: 0, right: 360, bottom: 640, x: 0, y: 0, toJSON() {} });
    return el;
  };
  it('tap changes style, drag moves without changing style', () => {
    render(<WorkoutStickerEditor data={data} />);
    area();
    const st = screen.getByTestId('sticker');
    fireEvent.pointerDown(st, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(st, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(st).toHaveAttribute('data-style', 'mini');
    expect(screen.getByTestId('sticker-mini')).toHaveTextContent('0/9');
    fireEvent.pointerDown(st, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(st, { pointerId: 1, clientX: 136, clientY: 100 });
    fireEvent.pointerUp(st, { pointerId: 1, clientX: 136, clientY: 100 });
    expect(st).toHaveAttribute('data-style', 'mini');
    expect(st.style.left).toBe('60%');
  });
  it('pinch scales within limits', () => {
    render(<WorkoutStickerEditor data={data} />);
    area();
    const st = screen.getByTestId('sticker');
    fireEvent.pointerDown(st, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(st, { pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(st, { pointerId: 2, clientX: 400, clientY: 100 });
    expect(st).toHaveAttribute('data-scale', '2.50');
    fireEvent.pointerUp(st, { pointerId: 2 });
    fireEvent.pointerUp(st, { pointerId: 1 });
    expect(st).toHaveAttribute('data-style', 'tempo');
  });
  it('exports a transparent PNG without photo', async () => {
    const ref = React.createRef<WorkoutStickerEditorHandle>();
    render(<WorkoutStickerEditor ref={ref} data={data} />);
    (globalThis as any).fetch = vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/png' }) }));
    let out: any;
    await act(async () => { out = await ref.current!.exportImage(); });
    expect(out.withPhoto).toBe(false);
    const opts = (toPng as any).mock.calls.at(-1)[1];
    expect(opts.backgroundColor).toBeUndefined();
    expect(opts.pixelRatio).toBeGreaterThanOrEqual(3);
  });
  it('exports a 1080×1920 story with photo', async () => {
    const ref = React.createRef<WorkoutStickerEditorHandle>();
    render(<WorkoutStickerEditor ref={ref} data={data} />);
    (URL as any).createObjectURL = vi.fn(() => 'blob:photo');
    (URL as any).revokeObjectURL = vi.fn();
    fireEvent.change(screen.getByTestId('sticker-gallery-input'), { target: { files: [new File(['p'], 'p.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByAltText('Sua foto')).toBeInTheDocument();
    const drawn: any[] = [];
    let size: any;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      const el: any = origCreate(tag);
      if (tag === 'canvas') {
        el.getContext = () => ({ drawImage: (...a: any[]) => drawn.push(a) });
        el.toBlob = (cb: any) => { size = [el.width, el.height]; cb(new Blob(['x'], { type: 'image/png' })); };
      }
      return el;
    });
    const OrigImage = globalThis.Image;
    (globalThis as any).Image = class { naturalWidth = 1000; naturalHeight = 1000; onload: any; set src(_v: string) { setTimeout(() => this.onload()); } };
    let out: any;
    await act(async () => { out = await ref.current!.exportImage(); });
    globalThis.Image = OrigImage;
    expect(out.withPhoto).toBe(true);
    expect(size).toEqual([1080, 1920]);
    expect(drawn).toHaveLength(2);
  });
});
