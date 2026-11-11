/**
 * Saídas de voz no navegador: áudios aprovados pela Web Audio (decodificados antes,
 * tocam na hora e se misturam à música do aluno) e a voz do celular como fallback.
 * O iPhone só libera o som num toque do usuário: `unlock()` vai no botão "Começar".
 */
import { supabase } from '@/integrations/supabase/client';
import { VoiceQueue, type VoiceOutputs } from './queue';

export const COACH_VOICE_BUCKET = 'coach-voice';

type Ctx = AudioContext;
let sharedCtx: Ctx | null = null;
/** Áudios já decodificados (caminho → buffer); os arquivos nunca mudam (caminho com data). */
const bufferByPath = new Map<string, Promise<AudioBuffer | null>>();

function audioContext(): Ctx | null {
  if (sharedCtx) return sharedCtx;
  if (typeof window === 'undefined') return null;
  const C = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return null;
  try { sharedCtx = new C() as Ctx; } catch { sharedCtx = null; }
  return sharedCtx;
}

function loadBuffer(path: string): Promise<AudioBuffer | null> {
  const cached = bufferByPath.get(path);
  if (cached) return cached;
  const job = (async () => {
    const ctx = audioContext();
    if (!ctx) return null;
    const { data, error } = await supabase.storage.from(COACH_VOICE_BUCKET).download(path);
    if (error || !data) throw error ?? new Error('download_failed');
    const bytes = await data.arrayBuffer();
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(bytes, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
    });
  })().catch(() => {
    bufferByPath.delete(path);
    return null;
  });
  bufferByPath.set(path, job);
  return job;
}

export interface CoachVoice {
  /** Chamar no toque do usuário (botão "Começar"). */
  unlock(): void;
  /** Busca os áudios aprovados; falas sem áudio continuam na voz do celular. */
  preload(): Promise<void>;
  say(texts: readonly string[]): void;
  cancel(): void;
  /** Quantas falas têm áudio pronto para tocar. */
  readonly readyCount: number;
}

export function createCoachVoice(): CoachVoice {
  const buffers = new Map<string, AudioBuffer>();
  let source: AudioBufferSourceNode | null = null;
  const pending = new Set<() => void>();
  const settleAll = () => { for (const r of [...pending]) r(); pending.clear(); };

  const outputs: VoiceOutputs = {
    hasClip: (key) => buffers.has(key) && audioContext()?.state === 'running',
    playClip: (key) => new Promise<void>((resolve, reject) => {
      const ctx = audioContext();
      const buf = buffers.get(key);
      if (!ctx || !buf || ctx.state !== 'running') { reject(new Error('clip_unavailable')); return; }
      try {
        const node = ctx.createBufferSource();
        node.buffer = buf;
        node.connect(ctx.destination);
        const done = () => { pending.delete(done); if (source === node) source = null; resolve(); };
        pending.add(done);
        node.onended = done;
        source = node;
        node.start();
      } catch (e) { reject(e); }
    }),
    speakTts: (text) => new Promise<void>((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) { resolve(); return; }
      let timer = 0;
      const done = () => { window.clearTimeout(timer); pending.delete(done); resolve(); };
      pending.add(done);
      try {
        const synth = window.speechSynthesis;
        const voices = synth.getVoices();
        const voice = voices.find((v) => v.lang?.toLowerCase() === 'pt-br') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('pt'));
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.rate = 1.05;
        if (voice) u.voice = voice;
        u.onend = done;
        u.onerror = done;
        // Alguns aparelhos nunca avisam o fim: segue a fila mesmo assim.
        timer = window.setTimeout(done, 1500 + text.length * 90);
        synth.speak(u);
      } catch { done(); }
    }),
    stop: () => {
      try { source?.stop(); } catch { /* já parou */ }
      source = null;
      try { if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* ignore */ }
      settleAll();
    },
  };
  const queue = new VoiceQueue(outputs);

  return {
    unlock() {
      const ctx = audioContext();
      if (ctx) {
        try {
          void ctx.resume?.();
          const b = ctx.createBuffer(1, 1, 22050);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
        } catch { /* ignore */ }
      }
      try {
        if ('speechSynthesis' in window) {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          window.speechSynthesis.speak(u);
        }
      } catch { /* ignore */ }
    },
    async preload() {
      try {
        const { data, error } = await supabase.rpc('coach_voice_approved');
        if (error || !Array.isArray(data)) return;
        const rows = data as { phrase_key: string; file_path: string }[];
        // Poucos por vez para não disputar a rede com o modelo da câmera.
        let i = 0;
        const worker = async () => {
          while (i < rows.length) {
            const row = rows[i++];
            const buf = await loadBuffer(row.file_path);
            if (buf) buffers.set(row.phrase_key, buf);
          }
        };
        await Promise.all([worker(), worker(), worker()]);
      } catch { /* sem áudio aprovado: voz do celular */ }
    },
    say: (texts) => { void queue.say(texts); },
    cancel: () => queue.cancel(),
    get readyCount() { return buffers.size; },
  };
}
