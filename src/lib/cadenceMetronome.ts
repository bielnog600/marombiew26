/**
 * Faixa de cadência da bike (luz + beep) — regras puras.
 * - Só bike com cadência no bloco atual (`cadenceRpm`).
 * - Intervalo = 60000 / rpm ms por volta; "Cada perna" = 2 batidas por volta (metade do intervalo).
 * - Batida n acontece em `âncora + n × intervalo` (âncora = início do bloco, que o player
 *   empurra ao retomar uma pausa): sem deriva em blocos longos e a contagem recomeça a cada bloco.
 * - Acento (beep mais forte) a cada 4 voltas; barrinhas 1-2-3-4 contam as voltas.
 * - O beep da cadência é pulado no começo do bloco (bipe de troca de fase) e nos últimos 3 s
 *   (bipes 3-2-1 do player); a luz continua.
 */
import type { CardioBlock, CardioModality } from './cardioParser';

export type CadenceBeatMode = 'volta' | 'perna';
export type CadenceSound = 'beep' | 'click' | 'mute';

export interface CadencePrefs {
  mode: CadenceBeatMode;
  sound: CadenceSound;
  /** Último som ligado (o botão de mudo volta para ele). */
  lastSound: Exclude<CadenceSound, 'mute'>;
}

export const DEFAULT_CADENCE_PREFS: CadencePrefs = { mode: 'volta', sound: 'beep', lastSound: 'beep' };
export const CADENCE_PREFS_KEY = 'cardio-cadence-prefs';
export const CADENCE_FLASH_MS = 90;
/** Bipes 3-2-1 do player: a cadência não bipa nesta janela final do bloco. */
export const CADENCE_END_QUIET_MS = 3050;
/** Bipe de troca de fase (0,36 s): a cadência não bipa logo no começo do bloco. */
export const CADENCE_START_QUIET_MS = 420;
export const CADENCE_MIN_RPM = 20;
export const CADENCE_MAX_RPM = 200;

/** rpm da faixa: só bike com cadência válida no bloco atual; senão null (faixa some). */
export function bikeCadenceRpm(block: CardioBlock | undefined, modality: CardioModality | string | undefined): number | null {
  if (modality !== 'bike' || !block) return null;
  const rpm = Number(block.cadenceRpm);
  if (!Number.isFinite(rpm) || rpm < CADENCE_MIN_RPM || rpm > CADENCE_MAX_RPM) return null;
  return Math.round(rpm);
}

export const beatsPerLap = (mode: CadenceBeatMode) => (mode === 'perna' ? 2 : 1);

/** ms entre batidas: 60000/rpm por volta; metade no modo perna. */
export function cadenceIntervalMs(rpm: number, mode: CadenceBeatMode = 'volta'): number {
  return 60000 / rpm / beatsPerLap(mode);
}

export interface CadenceBeat {
  index: number;
  /** Volta (0, 1, 2…). */
  lap: number;
  /** Primeira batida da volta (no modo perna, a segunda perna é false). */
  lapStart: boolean;
  /** Beep mais forte: primeira batida de cada grupo de 4 voltas. */
  accent: boolean;
  /** Barrinhas acesas (1-4). */
  bar: number;
}

export function cadenceBeat(index: number, mode: CadenceBeatMode = 'volta'): CadenceBeat {
  const per = beatsPerLap(mode);
  const lap = Math.floor(index / per);
  return { index, lap, lapStart: index % per === 0, accent: index % (4 * per) === 0, bar: (lap % 4) + 1 };
}

export const beatTimeMs = (anchorMs: number, index: number, intervalMs: number) => anchorMs + index * intervalMs;

/** Primeira batida em ou depois de `nowMs`. */
export function nextBeatIndex(anchorMs: number, intervalMs: number, nowMs: number): number {
  if (nowMs <= anchorMs) return 0;
  return Math.ceil((nowMs - anchorMs) / intervalMs - 1e-9);
}

/** A batida toca som? (mudo, som "Mudo", player mudo, começo do bloco ou 3-2-1 final → não). */
export function cadenceBeatSounds(p: {
  beatAtMs: number; anchorMs: number; blockEndMs: number; sound: CadenceSound; playerMuted: boolean;
}): boolean {
  if (p.sound === 'mute' || p.playerMuted) return false;
  if (p.beatAtMs - p.anchorMs < CADENCE_START_QUIET_MS) return false;
  if (p.blockEndMs - p.beatAtMs <= CADENCE_END_QUIET_MS) return false;
  return true;
}

export function cadenceHint(mode: CadenceBeatMode): string {
  return mode === 'perna'
    ? 'Pedala no ritmo da luz · 1 piscada = 1 perna'
    : 'Pedala no ritmo da luz · 1 piscada = 1 volta';
}

export function readCadencePrefs(storage?: Pick<Storage, 'getItem'> | null): CadencePrefs {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    const raw = s?.getItem(CADENCE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_CADENCE_PREFS };
    const v = JSON.parse(raw) as Partial<CadencePrefs>;
    const lastSound = v.lastSound === 'click' ? 'click' : 'beep';
    return {
      mode: v.mode === 'perna' ? 'perna' : 'volta',
      sound: v.sound === 'click' || v.sound === 'mute' ? v.sound : 'beep',
      lastSound,
    };
  } catch { return { ...DEFAULT_CADENCE_PREFS }; }
}

export function writeCadencePrefs(prefs: CadencePrefs, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    s?.setItem(CADENCE_PREFS_KEY, JSON.stringify(prefs));
  } catch { /* modo privado: fica só nesta sessão */ }
}

export function withSound(prefs: CadencePrefs, sound: CadenceSound): CadencePrefs {
  return { ...prefs, sound, lastSound: sound === 'mute' ? prefs.lastSound : sound };
}

/** Botão 🔊/🔇: mudo ↔ último som. */
export function toggleCadenceMute(prefs: CadencePrefs): CadencePrefs {
  return prefs.sound === 'mute' ? { ...prefs, sound: prefs.lastSound } : { ...prefs, sound: 'mute' };
}

/* ───────────── Agendador (relógio e timers injetáveis) ───────────── */

export interface CadenceRun {
  rpm: number;
  mode: CadenceBeatMode;
  /** Início do bloco (ms do relógio). */
  anchorMs: number;
  /** Fim do bloco (ms do relógio). */
  blockEndMs: number;
  sound: CadenceSound;
  playerMuted: boolean;
}

export interface ScheduledBeat extends CadenceBeat {
  atMs: number;
  /** Quanto falta para a batida quando foi agendada (para Web Audio / setTimeout). */
  delayMs: number;
  sound: boolean;
}

export interface CadenceSchedulerDeps {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  onBeat(beat: ScheduledBeat): void;
}

export const CADENCE_TICK_MS = 25;
export const CADENCE_LOOKAHEAD_MS = 80;
/** Batida que ficou para trás mais do que isso (aba em segundo plano) é pulada, sem rajada. */
export const CADENCE_LATE_SKIP_MS = 120;

export function createCadenceScheduler(deps: CadenceSchedulerDeps) {
  let run: CadenceRun | null = null;
  let timer: unknown = null;
  let next = 0;

  const pump = () => {
    if (!run) return;
    const interval = cadenceIntervalMs(run.rpm, run.mode);
    const now = deps.now();
    let at = beatTimeMs(run.anchorMs, next, interval);
    if (now - at > CADENCE_LATE_SKIP_MS) {
      next = nextBeatIndex(run.anchorMs, interval, now);
      at = beatTimeMs(run.anchorMs, next, interval);
    }
    while (at <= now + CADENCE_LOOKAHEAD_MS && at < run.blockEndMs) {
      const beat = cadenceBeat(next, run.mode);
      deps.onBeat({
        ...beat,
        atMs: at,
        delayMs: Math.max(0, at - now),
        sound: cadenceBeatSounds({ beatAtMs: at, anchorMs: run.anchorMs, blockEndMs: run.blockEndMs, sound: run.sound, playerMuted: run.playerMuted }),
      });
      next += 1;
      at = beatTimeMs(run.anchorMs, next, interval);
    }
  };

  return {
    /** Começa (ou muda rpm/bloco/âncora): recomeça a contagem pela batida certa do relógio. */
    start(r: CadenceRun) {
      const sameRhythm = run && run.rpm === r.rpm && run.mode === r.mode && run.anchorMs === r.anchorMs;
      if (!sameRhythm) next = nextBeatIndex(r.anchorMs, cadenceIntervalMs(r.rpm, r.mode), deps.now());
      run = { ...r };
      if (timer == null) timer = deps.setInterval(pump, CADENCE_TICK_MS);
      pump();
    },
    stop() {
      run = null;
      if (timer != null) { deps.clearInterval(timer); timer = null; }
    },
    get running() { return run != null; },
  };
}
