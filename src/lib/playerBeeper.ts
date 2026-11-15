// Bipes do Player do cardio: Web Audio (mistura com a música no iPhone) + <audio> curto de reserva,
// o mesmo esquema do TABATA. `unlock()` precisa ser chamado dentro de um toque.
export type BeepKind = 'countdown' | 'transition';

const TONE: Record<BeepKind, { freq: number; dur: number; vol: number }> = {
  countdown: { freq: 880, dur: 0.14, vol: 0.3 },
  transition: { freq: 1320, dur: 0.36, vol: 0.32 },
};

function beepDataUri(frequency: number, durationSec: number, volume: number): string {
  const sampleRate = 22050;
  const samples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const w = (o: number, v: string) => { for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const env = Math.min(1, i / (sampleRate * 0.01), (samples - i) / (sampleRate * 0.035));
    const v = Math.sin(2 * Math.PI * frequency * (i / sampleRate)) * volume * env;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
  }
  let bin = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export interface PlayerBeeper {
  unlock(): void;
  beep(kind: BeepKind): void;
  dispose(): void;
}

// Um só contexto de áudio para o app: liberado num toque (ex.: "INICIAR CARDIO" antes de abrir o player)
// continua liberado quando o player monta. Por isso não é fechado ao sair do player.
const shared: { ctx: AudioContext | null; html: Partial<Record<BeepKind, HTMLAudioElement[]>> } = { ctx: null, html: {} };

function audioCtx(): AudioContext | null {
  try {
    if (!shared.ctx || shared.ctx.state === 'closed') {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      shared.ctx = new C();
    }
    if (shared.ctx.state === 'suspended') shared.ctx.resume().catch(() => {});
    return shared.ctx;
  } catch { return null; }
}

function ensureHtml() {
  if (shared.html.countdown?.length || typeof Audio === 'undefined') return;
  try {
    (Object.keys(TONE) as BeepKind[]).forEach((k) => {
      const src = beepDataUri(TONE[k].freq, TONE[k].dur, 0.34);
      shared.html[k] = Array.from({ length: 3 }, () => { const a = new Audio(src); a.preload = 'auto'; return a; });
    });
  } catch { shared.html = {}; }
}

/** Libera o som no iPhone. Chamar dentro do toque do usuário (pode ser antes de abrir o player). */
export function unlockPlayerAudio(): void {
  const c = audioCtx();
  try {
    if (c) {
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, c.sampleRate || 44100);
      s.connect(c.destination); s.start(0);
    }
  } catch { /* noop */ }
  ensureHtml();
  Object.values(shared.html).flat().forEach((a) => {
    try {
      a!.muted = true;
      const p = a!.play();
      p?.then(() => { a!.pause(); a!.currentTime = 0; a!.muted = false; }).catch(() => { a!.muted = false; });
    } catch { /* noop */ }
  });
}

export function createPlayerBeeper(isMuted: () => boolean): PlayerBeeper {
  const cursor: Record<BeepKind, number> = { countdown: 0, transition: 0 };
  const onVisible = () => { if (shared.ctx?.state === 'suspended') shared.ctx.resume().catch(() => {}); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return {
    unlock: unlockPlayerAudio,
    beep(kind) {
      if (isMuted()) return;
      const t = TONE[kind];
      const c = audioCtx();
      let ok = false;
      if (c) {
        try {
          const at = c.currentTime + 0.01;
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(t.freq, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(t.vol, at + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
          osc.connect(gain).connect(c.destination);
          osc.start(at); osc.stop(at + t.dur + 0.05);
          ok = c.state === 'running';
        } catch { ok = false; }
      }
      if (!ok) {
        ensureHtml();
        const pool = shared.html[kind];
        if (pool?.length) {
          const a = pool[cursor[kind]++ % pool.length];
          try { a.currentTime = 0; a.muted = false; void a.play()?.catch(() => {}); } catch { /* noop */ }
        }
      }
    },
    dispose() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
