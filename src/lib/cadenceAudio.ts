/**
 * Som da faixa de cadência da bike.
 * - iPhone/iPad: pool de <audio> de mídia com Blob URLs de um beep/clique curto gerado aqui
 *   (mesma estratégia da voz da Correção ao vivo): toca mesmo com a chave no silencioso,
 *   liberado no toque do Iniciar (`unlockCadenceAudio`, chamado pelo `unlockPlayerAudio`).
 * - Outros aparelhos: Web Audio no contexto do player, agendado no relógio do AudioContext.
 * Nunca toca por cima dos bipes 3-2-1/troca de fase: quem decide pular é o agendador puro.
 */
/** iPhone/iPad (inclui iPad que se apresenta como Mac) — mesma regra da voz da Correção ao vivo. */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent || '')) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

export type CadenceTone = 'beep' | 'beepAccent' | 'click' | 'clickAccent';

const TONES: Record<CadenceTone, { freq: number; dur: number; vol: number; wave: 'sine' | 'square' }> = {
  beep: { freq: 1000, dur: 0.05, vol: 0.18, wave: 'sine' },
  beepAccent: { freq: 1568, dur: 0.07, vol: 0.3, wave: 'sine' },
  click: { freq: 2600, dur: 0.012, vol: 0.16, wave: 'square' },
  clickAccent: { freq: 3600, dur: 0.016, vol: 0.26, wave: 'square' },
};

export const cadenceToneFor = (sound: 'beep' | 'click', accent: boolean): CadenceTone =>
  sound === 'click' ? (accent ? 'clickAccent' : 'click') : (accent ? 'beepAccent' : 'beep');

function toneWav(t: { freq: number; dur: number; vol: number; wave: 'sine' | 'square' }): ArrayBuffer {
  const sampleRate = 22050;
  const samples = Math.max(1, Math.floor(sampleRate * t.dur));
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const w = (o: number, v: string) => { for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i)); };
  w(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const env = Math.min(1, i / (sampleRate * 0.002), (samples - i) / (sampleRate * 0.006));
    const s = Math.sin(2 * Math.PI * t.freq * (i / sampleRate));
    const v = (t.wave === 'square' ? Math.sign(s) * 0.6 : s) * t.vol * 1.6 * env;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
  }
  return buffer;
}

const POOL = 3;
const shared: { html: Partial<Record<CadenceTone, HTMLAudioElement[]>>; cursor: Record<CadenceTone, number> } = {
  html: {}, cursor: { beep: 0, beepAccent: 0, click: 0, clickAccent: 0 },
};

function ensurePool() {
  if (shared.html.beep?.length || typeof Audio === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
  try {
    (Object.keys(TONES) as CadenceTone[]).forEach((k) => {
      const url = URL.createObjectURL(new Blob([toneWav(TONES[k])], { type: 'audio/wav' }));
      shared.html[k] = Array.from({ length: POOL }, () => {
        const a = new Audio(url);
        a.preload = 'auto';
        a.setAttribute('playsinline', 'true');
        return a;
      });
    });
  } catch { shared.html = {}; }
}

/** Chamar dentro de um toque (o `unlockPlayerAudio` já chama). No iPhone libera o pool de <audio>. */
export function unlockCadenceAudio(): void {
  if (!isAppleMobile()) return;
  ensurePool();
  Object.values(shared.html).flat().forEach((a) => {
    try {
      a!.muted = true;
      const p = a!.play();
      p?.then(() => { a!.pause(); a!.currentTime = 0; a!.muted = false; }).catch(() => { a!.muted = false; });
    } catch { /* noop */ }
  });
}

export interface CadenceAudio {
  /** Toca o tom daqui a `delayMs` (agendado com precisão). */
  play(tone: CadenceTone, delayMs: number): void;
  /** Cancela o que já estava agendado (pausa, troca de bloco, mudo). */
  cancelAll(): void;
}

export function createCadenceAudio(getContext: () => AudioContext | null): CadenceAudio {
  const media = isAppleMobile();
  const timers = new Set<number>();
  const nodes = new Set<OscillatorNode>();

  const playMedia = (tone: CadenceTone) => {
    ensurePool();
    const pool = shared.html[tone];
    if (!pool?.length) return;
    const a = pool[shared.cursor[tone]++ % pool.length];
    try { a.currentTime = 0; a.muted = false; void a.play()?.catch(() => {}); } catch { /* noop */ }
  };

  return {
    play(tone, delayMs) {
      if (!media) {
        const c = getContext();
        if (c && c.state === 'running') {
          try {
            const t = TONES[tone];
            const at = c.currentTime + Math.max(0, delayMs) / 1000 + 0.005;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = t.wave;
            osc.frequency.setValueAtTime(t.freq, at);
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(t.vol, at + 0.003);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
            osc.connect(gain).connect(c.destination);
            osc.start(at); osc.stop(at + t.dur + 0.02);
            nodes.add(osc);
            osc.onended = () => nodes.delete(osc);
            return;
          } catch { /* cai no <audio> */ }
        }
      }
      const id = window.setTimeout(() => { timers.delete(id); playMedia(tone); }, Math.max(0, delayMs));
      timers.add(id);
    },
    cancelAll() {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      nodes.forEach((n) => { try { n.stop(); } catch { /* já parou */ } });
      nodes.clear();
    },
  };
}
