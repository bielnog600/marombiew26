// Tela "Cardio" do aluno: escolher qual sessão do plano fazer hoje. Regras puras (nada grava):
// opções do plano, título curto, chips, mini barra de intensidade, boxes PICO/RECUP., etapas
// agrupadas, semana Seg→Dom (cardio_sessions) e a sugestão do dia.
import {
  MODALITY_LABEL, STRUCTURE_LABEL, isWeeklyPlan, totalCardioDurationSec,
  type CardioBlock, type CardioModality, type CardioPayload, type CardioProtocol,
} from './cardioParser';
import { isHardBlock, mmss, ptNumber } from './cardioIntervals';
import { effortLabel } from './cardioPlayerView';
import { getWeekRange, localDateKey } from './localTrackingWeek';
import type { PhaseTone } from './tabataPlayerView';

/** Sessões do plano (plano não-semanal = uma opção só). */
export function cardioOptions(payload: CardioPayload | null | undefined): CardioProtocol[] {
  if (!payload) return [];
  const list = isWeeklyPlan(payload) ? payload.protocols : [payload];
  return list.filter(p => p && Array.isArray(p.blocks) && p.blocks.length > 0);
}

const isWarmCool = (b: CardioBlock) => b.type === 'aquecimento' || b.type === 'desaceleracao';
export const isPeak = (b: CardioBlock) => isHardBlock(b) && !isWarmCool(b);

/** Recuperações: etapas leves logo depois de um pico (ou do tipo recuperação). */
function recoveryBlocks(blocks: CardioBlock[]): CardioBlock[] {
  return blocks.filter((b, i) => !isPeak(b) && !isWarmCool(b) && (b.type === 'recuperacao' || (i > 0 && isPeak(blocks[i - 1]))));
}

export const peakCount = (p: CardioProtocol) => p.blocks.filter(isPeak).length;
export const durationMin = (p: CardioProtocol) => Math.max(1, Math.round(totalCardioDurationSec(p) / 60));

/** "HIIT na Bike", "Zona 2 na Passadeira". */
export function shortCardioTitle(p: CardioProtocol): string {
  const structure = STRUCTURE_LABEL[p.structure] ?? 'Cardio';
  return `${structure} na ${MODALITY_LABEL[p.modality] ?? 'máquina'}`;
}

const nums = (list: CardioBlock[], f: (b: CardioBlock) => number | undefined) =>
  list.map(f).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
const maxOf = (v: number[]) => (v.length ? Math.max(...v) : null);

const allPeaksStanding = (p: CardioProtocol) => {
  const peaks = p.blocks.filter(isPeak);
  return p.modality === 'bike' && peaks.length > 0 && peaks.every(b => b.bikePosition === 'em_pe');
};

/** "Picos em pé" / "Picos com inclinação" / "Picos de velocidade"… */
export function cardioSubtitle(p: CardioProtocol): string {
  const peaks = p.blocks.filter(isPeak);
  if (!peaks.length) return p.structure === 'zona2' ? 'Ritmo constante em Zona 2' : 'Ritmo contínuo';
  if (p.modality === 'bike') return allPeaksStanding(p) ? 'Picos em pé' : 'Picos de resistência';
  if (p.modality === 'passadeira') {
    const rec = recoveryBlocks(p.blocks);
    const pi = maxOf(nums(peaks, b => b.inclinePct)) ?? 0;
    const ri = maxOf(nums(rec, b => b.inclinePct)) ?? 0;
    return pi > ri ? 'Picos com inclinação' : 'Picos de velocidade';
  }
  if (p.modality === 'escada') return 'Picos de ritmo';
  return 'Picos de resistência';
}

export const INTENSITY_CHIP: Record<string, string> = { leve: 'Leve', moderada: 'Moderado', intensa: 'Intenso' };
export const intensityChip = (p: CardioProtocol) => INTENSITY_CHIP[p.intensity] ?? 'Moderado';

/** Chips do card: "32 min", "8 picos", "Intenso". */
export function cardioChips(p: CardioProtocol): string[] {
  const n = peakCount(p);
  return [`${durationMin(p)} min`, ...(n > 0 ? [`${n} ${n === 1 ? 'pico' : 'picos'}`] : []), intensityChip(p)];
}

/** "32 min · 8 picos em pé · Intenso". */
export function cardioHeadline(p: CardioProtocol): string {
  const n = peakCount(p);
  const peaks = n > 0 ? `${n} ${n === 1 ? 'pico' : 'picos'}${allPeaksStanding(p) ? ' em pé' : ''}` : (STRUCTURE_LABEL[p.structure] ?? 'Contínuo');
  return [`${durationMin(p)} min`, peaks, intensityChip(p)].join(' · ');
}

// ───────────── Mini barra de intensidade ─────────────

export type BarLevel = 'low' | 'mid' | 'high';
export interface IntensityBar { seconds: number; level: BarLevel; tone: PhaseTone; peak: boolean }

/** Uma barra por etapa: aquecimento/desaceleração azul baixa, pico laranja alta, recuperação verde média. */
export function intensityBars(p: CardioProtocol): IntensityBar[] {
  return p.blocks.map(b => {
    const seconds = Math.max(1, Math.round(Number(b.durationSec) || 0));
    if (isWarmCool(b)) return { seconds, level: 'low', tone: 'warmup', peak: false };
    if (isPeak(b)) return { seconds, level: 'high', tone: 'forte', peak: true };
    if (b.type === 'recuperacao' || b.intensityLabel === 'leve') return { seconds, level: 'mid', tone: 'rest', peak: false };
    return { seconds, level: 'mid', tone: 'moderado', peak: false };
  });
}

// ───────────── Boxes PICO / RECUP. ─────────────

const range = (v: number[]) => {
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? ptNumber(lo) : `${ptNumber(lo)}–${ptNumber(hi)}`;
};
const timeRange = (list: CardioBlock[]) => {
  const v = nums(list, b => b.durationSec);
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? mmss(lo) : `${mmss(lo)}–${mmss(hi)}`;
};
const POSITION: Record<string, string> = { em_pe: 'Em pé', sentado: 'Sentado', alternado: 'Alternado' };

/** "Em pé · Nível 10", "6 km/h · 8%", "Velocidade 6–7". Faixa min–max quando varia. */
export function groupParams(list: CardioBlock[], modality: CardioModality): string {
  const parts: string[] = [];
  if (modality === 'passadeira') {
    const sp = range(nums(list, b => b.speedKmh)); if (sp) parts.push(`${sp} km/h`);
    const inc = range(nums(list, b => b.inclinePct)); if (inc) parts.push(`${inc}%`);
  } else if (modality === 'bike') {
    const pos = [...new Set(list.map(b => b.bikePosition).filter(Boolean))];
    if (pos.length === 1 && POSITION[pos[0]!]) parts.push(POSITION[pos[0]!]);
    const lv = range(nums(list, b => b.resistanceLevel)); if (lv) parts.push(`Nível ${lv}`);
    if (!lv) { const rpm = range(nums(list, b => b.cadenceRpm)); if (rpm) parts.push(`${rpm} rpm`); }
  } else if (modality === 'escada') {
    const lv = range(nums(list, b => b.resistanceLevel));
    if (lv) parts.push(`Velocidade ${lv}`);
    else { const st = range(nums(list, b => b.stepsPerMin)); if (st) parts.push(`${st} degraus/min`); }
  } else {
    const lv = range(nums(list, b => b.resistanceLevel)); if (lv) parts.push(`Nível ${lv}`);
    if (!lv) { const c = range(nums(list, b => b.cadenceRpm)); if (c) parts.push(`${c} spm`); }
  }
  return parts.join(' · ');
}

export interface ParamBox { kind: 'pico' | 'recup' | 'principal'; label: string; time: string; detail: string }

export function paramBoxes(p: CardioProtocol): ParamBox[] {
  const peaks = p.blocks.filter(isPeak);
  if (peaks.length) {
    const out: ParamBox[] = [{ kind: 'pico', label: 'Pico', time: timeRange(peaks), detail: groupParams(peaks, p.modality) || 'Alta' }];
    const rec = recoveryBlocks(p.blocks);
    if (rec.length) out.push({ kind: 'recup', label: 'Recup.', time: timeRange(rec), detail: groupParams(rec, p.modality) || 'Leve' });
    return out;
  }
  const main = p.blocks.filter(b => !isWarmCool(b));
  const list = main.length ? main : p.blocks;
  return [{ kind: 'principal', label: 'Principal', time: timeRange(list), detail: groupParams(list, p.modality) || (p.targetZoneSummary ?? '') }];
}

// ───────────── Etapas agrupadas (detalhe) ─────────────

export type StepGroup =
  | { kind: 'single'; block: CardioBlock; index: number }
  | { kind: 'repeat'; blocks: CardioBlock[]; times: number; index: number };

const signature = (b: CardioBlock) => JSON.stringify([
  b.name, b.type, b.durationSec, b.intensityLabel, b.speedKmh, b.inclinePct, b.resistanceLevel, b.cadenceRpm, b.bikePosition, b.stepsPerMin,
]);

/** Agrupa os pares (ou trios) repetidos: Pico + Recuperação × 8 ciclos. */
export function groupCardioSteps(blocks: CardioBlock[]): StepGroup[] {
  const sig = blocks.map(signature);
  const out: StepGroup[] = [];
  let i = 0;
  while (i < blocks.length) {
    let best = { len: 1, times: 1 };
    for (const len of [2, 3, 1]) {
      if (i + len * 2 > blocks.length) continue;
      let times = 1;
      while (i + (times + 1) * len <= blocks.length && sig.slice(i, i + len).every((s, k) => s === sig[i + times * len + k])) times++;
      if (times >= 2 && len * times > best.len * best.times) best = { len, times };
    }
    if (best.times >= 2) {
      out.push({ kind: 'repeat', blocks: blocks.slice(i, i + best.len), times: best.times, index: i });
      i += best.len * best.times;
    } else {
      out.push({ kind: 'single', block: blocks[i], index: i });
      i++;
    }
  }
  return out;
}

/** "Aquecimento → 8 ciclos → Desaceleração". */
export function stepsLegend(p: CardioProtocol): string {
  const groups = groupCardioSteps(p.blocks);
  const cycles = Math.max(0, ...groups.map(g => (g.kind === 'repeat' && g.blocks.some(isPeak) ? g.times : 0)));
  const peaks = peakCount(p);
  const middle = cycles > 1 ? `${cycles} ciclos` : peaks > 0 ? `${peaks} ${peaks === 1 ? 'pico' : 'picos'}` : 'Parte principal';
  return [
    p.blocks.some(b => b.type === 'aquecimento') ? 'Aquecimento' : null,
    middle,
    p.blocks.some(b => b.type === 'desaceleracao') ? 'Desaceleração' : null,
  ].filter(Boolean).join(' → ');
}

// ───────────── Semana e sugestão ─────────────

export interface CardioDoneSession {
  id: string;
  completed_at: string;
  duration_seconds: number;
  rpe: number | null;
  plan_id: string | null;
  protocol_index: number | null;
  protocol_name: string | null;
}

const WEEKDAY_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const WEEK_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** 0 = segunda … 6 = domingo (data do aparelho). */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

/** A qual opção do plano a sessão feita pertence (posição gravada; senão pelo nome). */
export function matchOption(s: Pick<CardioDoneSession, 'plan_id' | 'protocol_index' | 'protocol_name'>, options: CardioProtocol[], planId: string | null): number {
  const samePlan = !planId || !s.plan_id || s.plan_id === planId;
  if (samePlan && typeof s.protocol_index === 'number' && s.protocol_index >= 0 && s.protocol_index < options.length) return s.protocol_index;
  if (!s.protocol_name) return -1;
  if (samePlan || s.protocol_index == null) return options.findIndex(o => o.title === s.protocol_name);
  return -1;
}

const inWeek = (iso: string, now: Date) => {
  const { dates } = getWeekRange(now);
  const key = localDateKey(new Date(iso));
  return dates.indexOf(key);
};

export interface CardioWeek { done: boolean[]; today: number; count: number; total: number }

/** "X de N feitos" e os 7 quadradinhos Seg→Dom. */
export function cardioWeek(sessions: CardioDoneSession[], total: number, now = new Date()): CardioWeek {
  const done = Array(7).fill(false) as boolean[];
  let count = 0;
  for (const s of sessions) {
    const d = inWeek(s.completed_at, now);
    if (d < 0) continue;
    done[d] = true;
    count++;
  }
  return { done, today: weekdayIndex(now), count: Math.min(total, count), total };
}

export interface OptionStatus { lastDoneAt: string | null; weekSession: CardioDoneSession | null }

export function optionStatuses(options: CardioProtocol[], sessions: CardioDoneSession[], planId: string | null, now = new Date()): OptionStatus[] {
  const out: OptionStatus[] = options.map(() => ({ lastDoneAt: null, weekSession: null }));
  const sorted = [...sessions].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  for (const s of sorted) {
    const i = matchOption(s, options, planId);
    if (i < 0) continue;
    if (!out[i].lastDoneAt) out[i].lastDoneAt = s.completed_at;
    if (!out[i].weekSession && inWeek(s.completed_at, now) >= 0) out[i].weekSession = s;
  }
  return out;
}

/** Sugerida: a que ainda não foi feita na semana e foi feita há mais tempo (nunca feita primeiro). */
export function suggestedOption(statuses: OptionStatus[]): { index: number; badge: boolean } {
  if (!statuses.length) return { index: -1, badge: false };
  const oldest = (list: number[]) => list.reduce((best, i) => {
    const a = statuses[i].lastDoneAt, b = statuses[best].lastDoneAt;
    if (a === b) return best;
    if (!a) return i;
    if (!b) return best;
    return a < b ? i : best;
  }, list[0]);
  const pending = statuses.map((_, i) => i).filter(i => !statuses[i].weekSession);
  if (pending.length) return { index: oldest(pending), badge: true };
  return { index: oldest(statuses.map((_, i) => i)), badge: false };
}

/** "Feito terça · 32 min · esforço Moderado". */
export function doneFooter(s: CardioDoneSession | null): string {
  if (!s) return 'Ainda não fez esta semana';
  const d = new Date(s.completed_at);
  const min = Math.max(1, Math.round((s.duration_seconds || 0) / 60));
  const effort = effortLabel(s.rpe);
  return [`Feito ${WEEKDAY_LONG[weekdayIndex(d)]}`, `${min} min`, effort ? `esforço ${effort}` : null].filter(Boolean).join(' · ');
}

/** "✓ Ter". */
export const doneBadge = (s: CardioDoneSession) => `✓ ${WEEKDAY_SHORT[weekdayIndex(new Date(s.completed_at))]}`;

/** "3 opções · escolhe a de hoje". */
export const optionsSubtitle = (n: number) => (n === 1 ? '1 opção · pronta para hoje' : `${n} opções · escolhe a de hoje`);
