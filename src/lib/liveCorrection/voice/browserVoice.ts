/**
 * Saídas de voz no navegador: áudios aprovados pela Web Audio (decodificados antes,
 * tocam na hora e se misturam à música do aluno), um <audio> com o arquivo como
 * segunda opção (decode do Safari falhou ou o contexto não voltou a tocar) e a voz do
 * celular só quando nenhum dos dois tocar.
 * iPhone: `unlock()` roda síncrono no toque (botões e qualquer toque na tela da câmera);
 * o contexto pode ficar 'suspended'/'interrupted' depois da câmera, de uma ligação ou
 * de ir para segundo plano, então cada áudio tenta `resume()` antes de desistir.
 */
import { supabase } from '@/integrations/supabase/client';
import { VoiceQueue, type VoiceOutputs } from './queue';
import { orderByPriority } from './phrases';
import { INITIAL_COACH_VOICE_STATUS, type CoachVoiceStatus } from './status';

export const COACH_VOICE_BUCKET = 'coach-voice';
const LOG_PREFIX = '[coach-voice]';
/** WAV mudo de 1 amostra, usado para liberar o <audio> no toque. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQIAAAAAAA==';

export interface ApprovedClipRow { phrase_key: string; file_path: string }
export interface LoadedClip { blob: Blob; buffer: AudioBuffer | null }

export interface CoachVoiceDeps {
  getContext(): AudioContext | null;
  fetchApproved(): Promise<ApprovedClipRow[]>;
  download(path: string): Promise<Blob>;
  createAudioElement(): HTMLAudioElement | null;
  createObjectURL(blob: Blob): string;
  speech(): SpeechSynthesis | null;
  log(message: string, detail?: unknown): void;
  /** Arquivos já baixados (caminho → áudio); os arquivos nunca mudam (caminho com data). */
  cache: Map<string, Promise<LoadedClip | null>>;
  resumeTimeoutMs: number;
  decodeTimeoutMs: number;
}

let sharedCtx: AudioContext | null = null;
const sharedCache = new Map<string, Promise<LoadedClip | null>>();

function defaultContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  if (typeof window === 'undefined') return null;
  const C = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return null;
  try { sharedCtx = new C() as AudioContext; } catch (e) { console.warn(LOG_PREFIX, 'AudioContext não criado', e); sharedCtx = null; }
  return sharedCtx;
}

export const defaultCoachVoiceDeps = (): CoachVoiceDeps => ({
  getContext: defaultContext,
  fetchApproved: async () => {
    const { data, error } = await supabase.rpc('coach_voice_approved');
    if (error) throw error;
    return Array.isArray(data) ? (data as ApprovedClipRow[]) : [];
  },
  download: async (path) => {
    const { data, error } = await supabase.storage.from(COACH_VOICE_BUCKET).download(path);
    if (error || !data) throw error ?? new Error('download_failed');
    return data;
  },
  createAudioElement: () => {
    if (typeof Audio === 'undefined') return null;
    const el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    return el;
  },
  createObjectURL: (blob) => URL.createObjectURL(blob),
  speech: () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null),
  log: (message, detail) => { if (detail === undefined) console.info(LOG_PREFIX, message); else console.warn(LOG_PREFIX, message, detail); },
  cache: sharedCache,
  resumeTimeoutMs: 800,
  decodeTimeoutMs: 8000,
});

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** decodeAudioData nas duas formas (callback do Safari antigo e promessa), resolvendo uma vez só. */
function decodeAudio(ctx: AudioContext, bytes: ArrayBuffer, timeoutMs: number): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error('decode_timeout')), timeoutMs);
    const ok = (b: AudioBuffer | null | undefined) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (b) resolve(b); else reject(new Error('decode_empty'));
    };
    function fail(e: unknown) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      reject(e ?? new Error('decode_failed'));
    }
    try {
      const p = ctx.decodeAudioData(bytes, ok, fail) as unknown as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(ok, fail);
    } catch (e) { fail(e); }
  });
}

function loadClip(deps: CoachVoiceDeps, path: string): Promise<LoadedClip | null> {
  const cached = deps.cache.get(path);
  if (cached) return cached;
  const job = (async (): Promise<LoadedClip | null> => {
    let blob: Blob;
    try {
      blob = await deps.download(path);
    } catch (e) {
      deps.log(`download falhou: ${path}`, e);
      return null;
    }
    let buffer: AudioBuffer | null = null;
    const ctx = deps.getContext();
    if (ctx) {
      try {
        // Cada decode recebe um ArrayBuffer novo (o Safari esvazia o que recebe).
        const bytes = await blob.arrayBuffer();
        buffer = await decodeAudio(ctx, bytes, deps.decodeTimeoutMs);
      } catch (e) {
        deps.log(`decode falhou, vai tocar pelo <audio>: ${path}`, e);
      }
    }
    return { blob, buffer };
  })();
  deps.cache.set(path, job);
  void job.then((r) => { if (!r) deps.cache.delete(path); });
  return job;
}

export interface CoachVoice {
  /** Chamar SÍNCRONO no toque do usuário (sem await antes): libera Web Audio, <audio> e voz do celular. */
  unlock(): void;
  /** Busca os áudios aprovados (prioridade primeiro); falas sem áudio continuam na voz do celular. */
  preload(priorityKeys?: readonly string[]): Promise<void>;
  /** Sem toque (ex.: 3-2-1 automático, voltar do segundo plano): tenta reativar o áudio. */
  prepare(): Promise<void>;
  say(texts: readonly string[]): void;
  cancel(): void;
  /** Quantas falas têm áudio pronto para tocar. */
  readonly readyCount: number;
  getStatus(): CoachVoiceStatus;
  subscribe(listener: (s: CoachVoiceStatus) => void): () => void;
  /** Só testes: saídas usadas pela fila. */
  readonly outputs: VoiceOutputs;
}

export function createCoachVoice(overrides: Partial<CoachVoiceDeps> = {}): CoachVoice {
  const deps: CoachVoiceDeps = { ...defaultCoachVoiceDeps(), ...overrides };
  const clips = new Map<string, LoadedClip>();
  const urlByKey = new Map<string, string>();
  let status: CoachVoiceStatus = { ...INITIAL_COACH_VOICE_STATUS };
  const listeners = new Set<(s: CoachVoiceStatus) => void>();
  const update = (patch: Partial<CoachVoiceStatus>) => {
    const next = { ...status, ...patch };
    if (Object.keys(patch).every((k) => (status as any)[k] === (next as any)[k])) return;
    status = next;
    for (const l of [...listeners]) l(status);
  };

  let source: AudioBufferSourceNode | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let elementPrimed = false;
  let speechPrimed = false;
  /** Sobe a cada stop(): áudio que ainda esperava o resume() não toca depois de parado. */
  let epoch = 0;
  const pending = new Set<() => void>();
  const settleAll = () => { for (const r of [...pending]) r(); pending.clear(); };

  let watchedCtx: AudioContext | null = null;
  const watchContext = (ctx: AudioContext | null) => {
    if (!ctx || watchedCtx === ctx) return;
    watchedCtx = ctx;
    const onChange = () => {
      deps.log(`AudioContext: ${ctx.state}`);
      update({ contextState: ctx.state });
    };
    try { ctx.addEventListener?.('statechange', onChange); } catch { /* sem evento: lido a cada toque */ }
    update({ contextState: ctx.state });
  };
  const context = () => { const ctx = deps.getContext(); watchContext(ctx); return ctx; };

  const ensureRunning = async (ctx: AudioContext): Promise<boolean> => {
    if (ctx.state === 'running') return true;
    const before = ctx.state;
    try {
      await Promise.race([Promise.resolve(ctx.resume?.()), wait(deps.resumeTimeoutMs)]);
    } catch (e) {
      deps.log(`resume falhou (estava ${before})`, e);
    }
    update({ contextState: ctx.state });
    if (ctx.state !== 'running') deps.log(`AudioContext continua ${ctx.state} depois do resume (estava ${before})`, ctx.state);
    return (ctx.state as string) === 'running';
  };

  const playBuffer = (ctx: AudioContext, buf: AudioBuffer) => new Promise<void>((resolve, reject) => {
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
  });

  const element = () => (audioEl ??= deps.createAudioElement());

  const playElement = (key: string, clip: LoadedClip) => new Promise<void>((resolve, reject) => {
    const el = element();
    if (!el) { reject(new Error('audio_element_unavailable')); return; }
    let url = urlByKey.get(key);
    if (!url) { url = deps.createObjectURL(clip.blob); urlByKey.set(key, url); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => { if (timer) clearTimeout(timer); pending.delete(done); el.onended = null; el.onerror = null; };
    const done = () => { cleanup(); resolve(); };
    const fail = (e: unknown) => { cleanup(); reject(e ?? new Error('audio_element_failed')); };
    pending.add(done);
    el.onended = done;
    el.onerror = () => fail(el.error ?? new Error('audio_element_error'));
    // Áudio que nunca avisa o fim não trava a fila.
    timer = setTimeout(done, 15000);
    try {
      el.src = url;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch (e) { fail(e); }
  });

  const outputs: VoiceOutputs = {
    hasClip: (key) => clips.has(key),
    playClip: async (key) => {
      const clip = clips.get(key);
      if (!clip) throw new Error('clip_unavailable');
      const myEpoch = epoch;
      const ctx = context();
      if (clip.buffer && ctx) {
        const running = await ensureRunning(ctx);
        if (myEpoch !== epoch) return;
        if (running) {
          try {
            await playBuffer(ctx, clip.buffer);
            update({ lastPlayFailed: false });
            return;
          } catch (e) { deps.log(`Web Audio não tocou ${key}`, e); }
        }
      }
      if (myEpoch !== epoch) return;
      try {
        await playElement(key, clip);
        update({ lastPlayFailed: false });
        return;
      } catch (e) {
        deps.log(`<audio> não tocou ${key}`, e);
      }
      update({ lastPlayFailed: true });
      throw new Error('clip_unavailable');
    },
    speakTts: (text) => new Promise<void>((resolve) => {
      const synth = deps.speech();
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') { resolve(); return; }
      let timer = 0 as unknown as ReturnType<typeof setTimeout>;
      const done = () => { clearTimeout(timer); pending.delete(done); resolve(); };
      pending.add(done);
      try {
        const voices = synth.getVoices();
        const voice = voices.find((v) => v.lang?.toLowerCase() === 'pt-br') ?? voices.find((v) => v.lang?.toLowerCase().startsWith('pt'));
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR';
        u.rate = 1.05;
        if (voice) u.voice = voice;
        u.onend = done;
        u.onerror = done;
        // Alguns aparelhos nunca avisam o fim: segue a fila mesmo assim.
        timer = setTimeout(done, 1500 + text.length * 90);
        synth.speak(u);
      } catch { done(); }
    }),
    stop: () => {
      epoch++;
      try { source?.stop(); } catch { /* já parou */ }
      source = null;
      try { audioEl?.pause(); } catch { /* ignore */ }
      try { deps.speech()?.cancel(); } catch { /* ignore */ }
      settleAll();
    },
  };
  const queue = new VoiceQueue(outputs);
  let preloadJob: Promise<void> | null = null;

  return {
    unlock() {
      update({ unlocked: true, lastPlayFailed: false });
      const ctx = context();
      if (ctx) {
        try {
          const r = ctx.resume?.() as Promise<void> | undefined;
          if (r && typeof r.then === 'function') {
            r.then(() => update({ contextState: ctx.state }), (e) => deps.log('resume no toque falhou', e));
          }
          const b = ctx.createBuffer(1, 1, 22050);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { deps.log('desbloqueio do Web Audio falhou', e); }
        update({ contextState: ctx.state });
      }
      // <audio> liberado uma vez no toque passa a tocar depois sem toque (segunda opção).
      if (!elementPrimed) {
        const el = element();
        if (el) {
          elementPrimed = true;
          try {
            el.src = SILENT_WAV;
            const p = el.play();
            if (p && typeof p.catch === 'function') p.catch((e) => { elementPrimed = false; deps.log('desbloqueio do <audio> falhou', e); });
          } catch (e) { elementPrimed = false; deps.log('desbloqueio do <audio> falhou', e); }
        }
      }
      if (!speechPrimed) {
        try {
          const synth = deps.speech();
          if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            synth.speak(u);
            speechPrimed = true;
          }
        } catch { /* ignore */ }
      }
    },
    preload(priorityKeys = []) {
      if (preloadJob) return preloadJob;
      preloadJob = (async () => {
        context();
        let rows: ApprovedClipRow[];
        try {
          rows = await deps.fetchApproved();
        } catch (e) {
          deps.log('lista de falas aprovadas falhou (rpc coach_voice_approved)', e);
          update({ loadErrors: status.loadErrors + 1 });
          preloadJob = null;
          return;
        }
        deps.log(`${rows.length} falas aprovadas`);
        update({ listed: true, approved: rows.length });
        const ordered = orderByPriority(rows, priorityKeys);
        // Poucos por vez para não disputar a rede com o modelo da câmera.
        let i = 0;
        let decoded = 0;
        const worker = async () => {
          while (i < ordered.length) {
            const row = ordered[i++];
            const clip = await loadClip(deps, row.file_path);
            if (clip) {
              clips.set(row.phrase_key, clip);
              if (clip.buffer) decoded++;
              update({ ready: clips.size });
            } else {
              update({ loadErrors: status.loadErrors + 1 });
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        deps.log(`áudios prontos ${clips.size}/${rows.length} (${decoded} decodificados, ${clips.size - decoded} pelo <audio>), AudioContext ${watchedCtx?.state ?? 'nenhum'}`);
      })();
      return preloadJob;
    },
    async prepare() {
      const ctx = context();
      if (ctx) await ensureRunning(ctx);
    },
    say: (texts) => { void queue.say(texts); },
    cancel: () => queue.cancel(),
    get readyCount() { return clips.size; },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    outputs,
  };
}
