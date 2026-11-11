/**
 * Saídas de voz no navegador para os áudios aprovados do personal.
 * - iPhone/iPad (modo 'audio'): toca por <audio> de mídia com o Blob URL do MP3 já baixado.
 *   O iOS deixa a Web Audio muda com a chave lateral no silencioso, mas o <audio> toca.
 *   Os elementos são criados ao abrir a tela e liberados no toque (`unlock()`); a Web Audio
 *   fica só como segunda opção (decodifica sob demanda).
 * - Outros aparelhos (modo 'webaudio'): Web Audio (decodificada antes, toca na hora e se
 *   mistura à música), com o <audio> como segunda opção.
 * - A voz do celular só entra quando nenhum dos dois tocar.
 * iPhone: `unlock()` roda síncrono no toque (botões e qualquer toque na tela da câmera);
 * o contexto pode ficar 'suspended'/'interrupted' depois da câmera, de uma ligação ou
 * de ir para segundo plano, então a Web Audio tenta `resume()` antes de desistir.
 */
import { supabase } from '@/integrations/supabase/client';
import { VoiceQueue, type VoiceItem, type VoiceOutputs } from './queue';
import { motivationClipFromRow, type MotivationClip } from './motivation';
import { orderByPriority } from './phrases';
import { INITIAL_COACH_VOICE_STATUS, type CoachVoicePlaybackMode, type CoachVoiceStatus } from './status';

export const COACH_VOICE_BUCKET = 'coach-voice';
const LOG_PREFIX = '[coach-voice]';
/** WAV mudo de 1 amostra, usado para liberar o <audio> no toque. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQIAAAAAAA==';

export interface ApprovedClipRow {
  phrase_key: string;
  file_path: string;
  /** 'sistema' | 'personalizada' | 'nome' (ausente = sistema). */
  tipo?: string | null;
  momento?: string | null;
  frequencia?: string | null;
  texto?: string | null;
}
export interface LoadedClip {
  blob: Blob;
  buffer: AudioBuffer | null;
  /** Já tentou decodificar (não tenta de novo a cada fala). */
  decodeTried: boolean;
}
/** Elementos <audio> pré-criados e liberados no toque (alternados a cada áudio). */
const AUDIO_POOL_SIZE = 2;

/** iPhone/iPad (inclui iPad que se apresenta como Mac). */
export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

export interface CoachVoiceDeps {
  getContext(): AudioContext | null;
  fetchApproved(): Promise<ApprovedClipRow[]>;
  /** Falas de motivação ligadas (chave geral do admin + a do aluno). */
  fetchMotivationEnabled(): Promise<boolean>;
  download(path: string): Promise<Blob>;
  createAudioElement(): HTMLAudioElement | null;
  createObjectURL(blob: Blob): string;
  speech(): SpeechSynthesis | null;
  log(message: string, detail?: unknown): void;
  /** Arquivos já baixados (caminho → áudio); os arquivos nunca mudam (caminho com data). */
  cache: Map<string, Promise<LoadedClip | null>>;
  resumeTimeoutMs: number;
  decodeTimeoutMs: number;
  /** true = toca por <audio> de mídia primeiro (iPhone: funciona com a chave no silencioso). */
  preferMediaElement: boolean;
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

/** `studentId`: aluno da câmera (o servidor só devolve as falas com o nome dele). */
export const defaultCoachVoiceDeps = (studentId?: string | null): CoachVoiceDeps => ({
  getContext: defaultContext,
  fetchApproved: async () => {
    const { data, error } = await supabase.rpc('coach_voice_clips', studentId ? { _student_id: studentId } : {});
    if (error) throw error;
    return Array.isArray(data) ? (data as ApprovedClipRow[]) : [];
  },
  fetchMotivationEnabled: async () => {
    const { data, error } = await supabase.rpc('coach_voice_motivation_enabled', studentId ? { _student_id: studentId } : {});
    if (error) throw error;
    return data === true;
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
  preferMediaElement: isAppleMobile(),
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

async function decodeClip(deps: CoachVoiceDeps, ctx: AudioContext, path: string, clip: LoadedClip): Promise<void> {
  if (clip.buffer || clip.decodeTried) return;
  clip.decodeTried = true;
  try {
    // Cada decode recebe um ArrayBuffer novo (o Safari esvazia o que recebe).
    const bytes = await clip.blob.arrayBuffer();
    clip.buffer = await decodeAudio(ctx, bytes, deps.decodeTimeoutMs);
  } catch (e) {
    deps.log(`decode falhou, vai tocar pelo <audio>: ${path}`, e);
  }
}

/** Baixa o arquivo; decodifica já no download só no modo Web Audio. */
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
    const clip: LoadedClip = { blob, buffer: null, decodeTried: false };
    if (!deps.preferMediaElement) {
      const ctx = deps.getContext();
      if (ctx) await decodeClip(deps, ctx, path, clip);
    }
    return clip;
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
  say(texts: readonly VoiceItem[]): void;
  cancel(): void;
  /** Quantas falas do sistema têm áudio pronto para tocar. */
  readonly readyCount: number;
  /** Falas de motivação com áudio pronto (vazio se desligadas para o aluno). */
  motivationClips(): MotivationClip[];
  getStatus(): CoachVoiceStatus;
  subscribe(listener: (s: CoachVoiceStatus) => void): () => void;
  /** Só testes: saídas usadas pela fila. */
  readonly outputs: VoiceOutputs;
}

export function createCoachVoice(overrides: Partial<CoachVoiceDeps> & { studentId?: string | null } = {}): CoachVoice {
  const { studentId, ...rest } = overrides;
  const deps: CoachVoiceDeps = { ...defaultCoachVoiceDeps(studentId), ...rest };
  const mode: CoachVoicePlaybackMode = deps.preferMediaElement ? 'audio' : 'webaudio';
  const clips = new Map<string, LoadedClip>();
  /** Falas de motivação aprovadas (o áudio pode ainda estar baixando). */
  const motivationRows = new Map<string, MotivationClip>();
  let motivationEnabled = false;
  let systemReady = 0;
  const pathByKey = new Map<string, string>();
  const urlByKey = new Map<string, string>();
  let status: CoachVoiceStatus = { ...INITIAL_COACH_VOICE_STATUS, mode };
  const listeners = new Set<(s: CoachVoiceStatus) => void>();
  const update = (patch: Partial<CoachVoiceStatus>) => {
    const next = { ...status, ...patch };
    if (Object.keys(patch).every((k) => (status as any)[k] === (next as any)[k])) return;
    status = next;
    for (const l of [...listeners]) l(status);
  };

  let source: AudioBufferSourceNode | null = null;
  /** Elementos <audio> pré-criados; cada um precisa ser liberado no toque (iOS). */
  const pool: HTMLAudioElement[] = [];
  const primed = new Set<HTMLAudioElement>();
  let nextEl = 0;
  /** Elemento tocando agora (o desbloqueio de um toque no meio da fala não troca o src dele). */
  let currentEl: HTMLAudioElement | null = null;
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
    // resume() muda o estado por fora: lê de novo sem o estreitamento do TypeScript.
    const after = (ctx as AudioContext).state as string;
    update({ contextState: after });
    if (after !== 'running') deps.log(`AudioContext continua ${after} depois do resume (estava ${before})`, after);
    return after === 'running';
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

  /** Cria os elementos de uma vez (ao abrir a tela e no toque), sem duplicar. */
  const ensurePool = () => {
    while (pool.length < AUDIO_POOL_SIZE) {
      const el = deps.createAudioElement();
      if (!el) break;
      pool.push(el);
    }
    return pool;
  };
  /** Próximo elemento, preferindo os já liberados no toque. */
  const takeElement = (): HTMLAudioElement | null => {
    const all = ensurePool();
    if (!all.length) return null;
    for (let n = 0; n < all.length; n++) {
      const el = all[(nextEl + n) % all.length];
      if (primed.has(el)) { nextEl = (all.indexOf(el) + 1) % all.length; return el; }
    }
    const el = all[nextEl % all.length];
    nextEl = (nextEl + 1) % all.length;
    return el;
  };

  const urlFor = (key: string, clip: LoadedClip) => {
    let url = urlByKey.get(key);
    if (!url) { url = deps.createObjectURL(clip.blob); urlByKey.set(key, url); }
    return url;
  };

  const playElement = (key: string, clip: LoadedClip) => new Promise<void>((resolve, reject) => {
    const el = takeElement();
    if (!el) { reject(new Error('audio_element_unavailable')); return; }
    const url = urlFor(key, clip);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      pending.delete(done);
      el.onended = null; el.onerror = null;
      if (currentEl === el) currentEl = null;
    };
    const done = () => { cleanup(); resolve(); };
    const fail = (e: unknown) => { cleanup(); reject(e ?? new Error('audio_element_failed')); };
    pending.add(done);
    el.onended = done;
    el.onerror = () => fail(el.error ?? new Error('audio_element_error'));
    // Áudio que nunca avisa o fim não trava a fila.
    timer = setTimeout(done, 15000);
    currentEl = el;
    try {
      el.src = url;
      try { el.currentTime = 0; } catch { /* alguns navegadores só depois de carregar */ }
      const p = el.play();
      if (p && typeof p.then === 'function') p.then(() => primed.add(el), fail);
      else primed.add(el);
    } catch (e) { fail(e); }
  });

  /** Web Audio; decodifica na hora se ainda não tiver (modo 'audio' não decodifica antes). */
  const tryWebAudio = async (key: string, clip: LoadedClip, myEpoch: number): Promise<boolean> => {
    const ctx = context();
    if (!ctx) return false;
    if (!clip.buffer) await decodeClip(deps, ctx, pathByKey.get(key) ?? key, clip);
    if (!clip.buffer || myEpoch !== epoch) return false;
    const running = await ensureRunning(ctx);
    if (!running || myEpoch !== epoch) return false;
    try {
      await playBuffer(ctx, clip.buffer);
      return true;
    } catch (e) {
      deps.log(`Web Audio não tocou ${key}`, e);
      return false;
    }
  };

  const tryElement = async (key: string, clip: LoadedClip): Promise<boolean> => {
    try {
      await playElement(key, clip);
      return true;
    } catch (e) {
      deps.log(`<audio> não tocou ${key}`, e);
      return false;
    }
  };

  const outputs: VoiceOutputs = {
    hasClip: (key) => clips.has(key),
    playClip: async (key) => {
      const clip = clips.get(key);
      if (!clip) throw new Error('clip_unavailable');
      const myEpoch = epoch;
      const order: CoachVoicePlaybackMode[] = mode === 'audio' ? ['audio', 'webaudio'] : ['webaudio', 'audio'];
      for (const path of order) {
        if (myEpoch !== epoch) return;
        const ok = path === 'audio' ? await tryElement(key, clip) : await tryWebAudio(key, clip, myEpoch);
        if (myEpoch !== epoch) return;
        if (ok) { update({ lastPlayFailed: false, playedMode: path }); return; }
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
      for (const el of pool) { try { el.pause(); } catch { /* ignore */ } }
      try { deps.speech()?.cancel(); } catch { /* ignore */ }
      settleAll();
    },
  };
  const queue = new VoiceQueue(outputs);
  let preloadJob: Promise<void> | null = null;

  /** Libera cada <audio> no toque: tocar algo mudo dentro do gesto vale para os próximos áudios. */
  const primeElements = () => {
    for (const el of ensurePool()) {
      if (primed.has(el) || el === currentEl) continue;
      primed.add(el);
      try {
        el.src = SILENT_WAV;
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch((e) => { primed.delete(el); deps.log('desbloqueio do <audio> falhou', e); });
      } catch (e) { primed.delete(el); deps.log('desbloqueio do <audio> falhou', e); }
    }
  };

  return {
    unlock() {
      update({ unlocked: true, lastPlayFailed: false });
      // Modo 'audio': o <audio> é o caminho principal, liberado antes de tudo.
      if (mode === 'audio') primeElements();
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
      // Modo 'webaudio': <audio> liberado como segunda opção.
      if (mode !== 'audio') primeElements();
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
        // Elementos prontos antes do primeiro toque (o toque só precisa liberá-los).
        ensurePool();
        let rows: ApprovedClipRow[];
        const motivationJob = deps.fetchMotivationEnabled().then(
          (v) => { motivationEnabled = v; },
          (e) => { motivationEnabled = false; deps.log('chave das falas de motivação falhou', e); },
        );
        try {
          rows = await deps.fetchApproved();
        } catch (e) {
          deps.log('lista de falas aprovadas falhou (rpc coach_voice_approved)', e);
          update({ loadErrors: status.loadErrors + 1 });
          preloadJob = null;
          return;
        }
        // Selo e contagem só das falas do sistema; motivação vem depois no download.
        const systemRows = rows.filter((r) => !r.tipo || r.tipo === 'sistema');
        for (const r of rows) {
          const m = motivationClipFromRow(r);
          if (m) motivationRows.set(m.key, m);
        }
        deps.log(`${systemRows.length} falas aprovadas + ${motivationRows.size} de motivação (modo ${mode})`);
        update({ listed: true, approved: systemRows.length });
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
              pathByKey.set(row.phrase_key, row.file_path);
              // Modo 'audio': o Blob URL já fica pronto, o toque só troca o src.
              if (mode === 'audio') urlFor(row.phrase_key, clip);
              if (clip.buffer) decoded++;
              if (!motivationRows.has(row.phrase_key)) systemReady++;
              update({ ready: systemReady });
            } else {
              update({ loadErrors: status.loadErrors + 1 });
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), motivationJob]);
        deps.log(`áudios prontos ${clips.size}/${rows.length} (modo ${mode}, ${decoded} decodificados), AudioContext ${watchedCtx?.state ?? 'nenhum'}`);
      })();
      return preloadJob;
    },
    async prepare() {
      const ctx = context();
      if (ctx) await ensureRunning(ctx);
    },
    say: (texts) => { void queue.say(texts); },
    cancel: () => queue.cancel(),
    get readyCount() { return systemReady; },
    motivationClips: () => (motivationEnabled ? [...motivationRows.values()].filter((m) => clips.has(m.key)) : []),
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    outputs,
  };
}
