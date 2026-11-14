// HIIT / Intervalado com picos definidos pelo coach — regras puras (sem React, sem banco).
// O coach escolhe no Cardio IA o tempo/velocidade do pico e da recuperação e o Nº de ciclos;
// a sessão intervalada passa a ter EXATAMENTE esses blocos alternados, entre o aquecimento
// e a desaceleração que a IA montou. Usado pela tela (resumo, editor) e pelo cardio-agent
// (via officeCore), então tela e servidor normalizam do mesmo jeito.
import {
  formatDurationFromSec, isWeeklyPlan,
  type CardioBlock, type CardioModality, type CardioPayload, type CardioProtocol, type CardioStructure,
} from './cardioParser';

export interface IntervalStep {
  durationSec: number;
  speedKmh?: number;
  inclinePct?: number;
  resistanceLevel?: number;
  bikePosition?: 'sentado' | 'em_pe' | 'alternado';
}

export interface IntervalSpec {
  modality: Extract<CardioModality, 'passadeira' | 'bike'>;
  work: IntervalStep;
  rest: IntervalStep;
  /** null = o coach não escolheu: mantém a quantidade de picos da IA. */
  rounds: number | null;
}

/** Mesmo formato de `buildEquipment` (cardioWizard). */
export interface EquipmentInput {
  treadmill?: { speedEasy?: number; speedHard?: number; inclineEasy?: number; inclineHard?: number; workSec?: number; restSec?: number };
  bike?: {
    hiit?: boolean; position?: string; standSec?: number; seatSec?: number; hardSec?: number; easySec?: number;
    hardLevel?: number; easyLevel?: number;
  };
  rounds?: number;
}

export const MAX_INTERVAL_ROUNDS = 40;
const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
};
const numOrZero = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Picos definidos pelo coach (esteira e/ou bike). Precisa do tempo do pico e da recuperação. */
export function intervalSpecs(equipment: EquipmentInput | null | undefined): IntervalSpec[] {
  const eq = equipment && typeof equipment === 'object' ? equipment : {};
  const rounds = num(eq.rounds);
  const r = rounds ? Math.min(MAX_INTERVAL_ROUNDS, Math.round(rounds)) : null;
  const out: IntervalSpec[] = [];
  const t = eq.treadmill ?? {};
  const tWork = num(t.workSec), tRest = num(t.restSec);
  if (tWork && tRest) {
    out.push({
      modality: 'passadeira',
      work: clean({ durationSec: Math.round(tWork), speedKmh: num(t.speedHard), inclinePct: numOrZero(t.inclineHard) }),
      rest: clean({ durationSec: Math.round(tRest), speedKmh: num(t.speedEasy), inclinePct: numOrZero(t.inclineEasy) }),
      rounds: r,
    });
  }
  const b = eq.bike ?? {};
  const hard = num(b.hardSec), easy = num(b.easySec), stand = num(b.standSec), seat = num(b.seatSec);
  const bWork = hard ?? stand, bRest = easy ?? seat;
  if (bWork && bRest) {
    let workPos: IntervalStep['bikePosition'];
    let restPos: IntervalStep['bikePosition'];
    if (b.position === 'sentado') { workPos = 'sentado'; restPos = 'sentado'; }
    else if (b.position === 'em_pe') { workPos = 'em_pe'; restPos = 'em_pe'; }
    else if (!hard && stand) { workPos = 'em_pe'; restPos = 'sentado'; }
    out.push({
      modality: 'bike',
      work: clean({ durationSec: Math.round(bWork), resistanceLevel: num(b.hardLevel), bikePosition: workPos }),
      rest: clean({ durationSec: Math.round(bRest), resistanceLevel: num(b.easyLevel), bikePosition: restPos }),
      rounds: r,
    });
  }
  return out;
}

/** 120 → "2:00". */
export const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** 5.5 → "5,5". */
export const ptNumber = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

const POSITION_TEXT: Record<string, string> = { em_pe: 'em pé', sentado: 'sentado', alternado: 'alternado' };

function stepText(modality: IntervalSpec['modality'], s: IntervalStep): string {
  const parts = [mmss(s.durationSec)];
  if (modality === 'passadeira') {
    if (s.speedKmh != null) parts.push(`a ${ptNumber(s.speedKmh)} km/h`);
    if (s.inclinePct != null && s.inclinePct > 0) parts.push(`· ${ptNumber(s.inclinePct)}%`);
  } else {
    if (s.bikePosition && s.bikePosition !== 'alternado') parts.push(POSITION_TEXT[s.bikePosition]);
    if (s.resistanceLevel != null) parts.push(`nível ${ptNumber(s.resistanceLevel)}`);
  }
  return parts.join(' ');
}

export const intervalCycleSeconds = (s: Pick<IntervalSpec, 'work' | 'rest'>) => s.work.durationSec + s.rest.durationSec;

/** "8 × (2:00 a 6 km/h + 1:00 a 4 km/h) = 24 min". Sem Nº de ciclos: "(…) por ciclo". */
export function intervalSummary(spec: IntervalSpec): string {
  const pair = `(${stepText(spec.modality, spec.work)} + ${stepText(spec.modality, spec.rest)})`;
  if (!spec.rounds) return `${pair} por ciclo · ${mmss(intervalCycleSeconds(spec))} cada`;
  return `${spec.rounds} × ${pair} = ${formatDurationFromSec(spec.rounds * intervalCycleSeconds(spec))}`;
}

export const isIntervalStructure = (s: CardioStructure | string | undefined) => s === 'hiit' || s === 'intervalado';
export const isHardBlock = (b: Pick<CardioBlock, 'type' | 'intensityLabel'> | undefined) =>
  !!b && (b.type === 'pico' || b.intensityLabel === 'forte' || b.intensityLabel === 'maxima');

/** Aquecimento do início e desaceleração do fim (o que fica em volta dos ciclos). */
export function splitAroundIntervals(blocks: CardioBlock[]) {
  let start = 0;
  while (start < blocks.length && blocks[start]?.type === 'aquecimento') start++;
  let end = blocks.length;
  while (end > start && blocks[end - 1]?.type === 'desaceleracao') end--;
  return { warmup: blocks.slice(0, start), middle: blocks.slice(start, end), cooldown: blocks.slice(end) };
}

const WORK_NAME = 'Pico forte';
const REST_NAME = 'Recuperação';

function stepFields(modality: IntervalSpec['modality'], s: IntervalStep): Partial<CardioBlock> {
  return modality === 'passadeira'
    ? clean({ speedKmh: s.speedKmh, inclinePct: s.inclinePct })
    : clean({ resistanceLevel: s.resistanceLevel, bikePosition: s.bikePosition });
}

/**
 * Sessão com os ciclos EXATOS do coach: aquecimento da IA (ou 5 min em Z1), N × (pico + recuperação)
 * com os tempos/velocidades informados e a desaceleração da IA (ou 3 min em Z1). Idempotente.
 */
export function applyIntervalSpec(protocol: CardioProtocol, spec: IntervalSpec): CardioProtocol {
  const blocks = Array.isArray(protocol.blocks) ? protocol.blocks : [];
  const { warmup, middle, cooldown } = splitAroundIntervals(blocks);
  const workTpl = middle.find(b => isHardBlock(b));
  const restTpl = middle.find(b => b.type === 'recuperacao') ?? middle.find(b => b !== workTpl && !isHardBlock(b));
  const aiRounds = middle.filter(b => isHardBlock(b)).length;
  const rounds = Math.max(1, Math.min(MAX_INTERVAL_ROUNDS, spec.rounds ?? (aiRounds || 6)));
  const cadence = (tpl?: CardioBlock) => (spec.modality === 'bike' && tpl?.cadenceRpm != null ? { cadenceRpm: tpl.cadenceRpm } : {});

  const cycles: CardioBlock[] = [];
  for (let i = 1; i <= rounds; i++) {
    cycles.push(clean({
      name: WORK_NAME,
      type: 'pico',
      durationSec: spec.work.durationSec,
      intensityLabel: workTpl?.intensityLabel === 'maxima' ? 'maxima' : 'forte',
      targetZone: workTpl?.targetZone || 'Z4',
      ...cadence(workTpl),
      ...stepFields(spec.modality, spec.work),
      notes: `Ciclo ${i} de ${rounds}`,
    }) as CardioBlock);
    cycles.push(clean({
      name: REST_NAME,
      type: 'recuperacao',
      durationSec: spec.rest.durationSec,
      intensityLabel: restTpl?.intensityLabel === 'moderada' ? 'moderada' : 'leve',
      targetZone: restTpl?.targetZone || 'Z2',
      ...cadence(restTpl),
      ...stepFields(spec.modality, spec.rest),
      notes: `Ciclo ${i} de ${rounds}`,
    }) as CardioBlock);
  }

  const easy = stepFields(spec.modality, spec.rest);
  const head: CardioBlock[] = warmup.length ? warmup : [clean({
    name: 'Aquecimento', type: 'aquecimento', durationSec: 300, intensityLabel: 'leve', targetZone: 'Z1', ...easy,
  }) as CardioBlock];
  const tail: CardioBlock[] = cooldown.length ? cooldown : [clean({
    name: 'Desaceleração', type: 'desaceleracao', durationSec: 180, intensityLabel: 'leve', targetZone: 'Z1', ...easy,
  }) as CardioBlock];

  const out = [...head, ...cycles, ...tail];
  const total = out.reduce((s, b) => s + (b.durationSec || 0), 0);
  return {
    ...protocol,
    modality: spec.modality,
    structure: isIntervalStructure(protocol.structure) ? protocol.structure : 'intervalado',
    totalDurationMin: Math.round(total / 60),
    blocks: out,
  };
}

/** A sessão já tem exatamente os ciclos do coach? */
export function matchesIntervalSpec(protocol: CardioProtocol, spec: IntervalSpec): boolean {
  return JSON.stringify(applyIntervalSpec(protocol, spec).blocks) === JSON.stringify(protocol.blocks)
    && protocol.modality === spec.modality;
}

export interface NormalizeOptions {
  style?: string;
  equipment?: EquipmentInput | null;
  /** Modalidades permitidas no pedido ([] = todas). */
  modalities?: string[] | null;
}

export interface NormalizeResult<T extends CardioPayload> {
  payload: T;
  /** Índices das sessões reescritas com os ciclos do coach. */
  changed: number[];
}

/**
 * Pós-processamento do cardio-agent: toda sessão intervalada/HIIT da modalidade com picos definidos
 * recebe os ciclos exatos. No estilo HIIT/Intervalado, se a IA não fez nenhuma sessão intervalada
 * nessa modalidade, a primeira sessão dessa modalidade (ou a primeira da semana) vira a intervalada.
 */
export function normalizeCardioIntervals<T extends CardioPayload>(payload: T, opts: NormalizeOptions): NormalizeResult<T> {
  const specs = intervalSpecs(opts.equipment);
  if (!specs.length || !payload) return { payload, changed: [] };
  const weekly = isWeeklyPlan(payload);
  const list: CardioProtocol[] = weekly ? [...(payload as any).protocols] : [payload as CardioProtocol];
  const allowed = (opts.modalities ?? []).filter(Boolean);
  const intervalStyle = isIntervalStructure(opts.style);
  const changed = new Set<number>();
  const taken = new Set<number>();

  for (const spec of specs) {
    if (allowed.length && !allowed.includes(spec.modality)) continue;
    let targets = list.map((p, i) => ({ p, i }))
      .filter(({ p, i }) => !taken.has(i) && p?.modality === spec.modality && isIntervalStructure(p.structure))
      .map(({ i }) => i);
    if (!targets.length && intervalStyle) {
      const sameMod = list.findIndex((p, i) => !taken.has(i) && p?.modality === spec.modality);
      const anyInterval = list.findIndex((p, i) => !taken.has(i) && isIntervalStructure(p?.structure));
      const fallback = list.findIndex((_p, i) => !taken.has(i));
      const pick = sameMod >= 0 ? sameMod : anyInterval >= 0 ? anyInterval : fallback;
      if (pick >= 0) {
        targets = [pick];
        list[pick] = { ...list[pick], structure: opts.style === 'hiit' ? 'hiit' : 'intervalado' };
      }
    }
    for (const i of targets) {
      taken.add(i);
      const next = applyIntervalSpec(list[i], spec);
      if (JSON.stringify(next) !== JSON.stringify(list[i])) changed.add(i);
      list[i] = next;
    }
  }
  const out = weekly ? { ...(payload as any), protocols: list } : list[0];
  return { payload: out as T, changed: [...changed].sort((a, b) => a - b) };
}

/**
 * Editor do admin: "Repetir par forte/recuperação × N". Usa o bloco forte indicado (ou o primeiro)
 * e o bloco logo depois dele como recuperação, e repete o par N vezes entre aquecimento e desaceleração.
 */
export function repeatIntervalPair(protocol: CardioProtocol, rounds: number, workIndex?: number): CardioProtocol | null {
  const blocks = protocol.blocks ?? [];
  const wi = workIndex ?? blocks.findIndex(b => isHardBlock(b) && b.type !== 'aquecimento' && b.type !== 'desaceleracao');
  const work = blocks[wi];
  const rest = blocks[wi + 1];
  if (!work || !rest || rest.type === 'desaceleracao') return null;
  const n = Math.max(1, Math.min(MAX_INTERVAL_ROUNDS, Math.round(rounds)));
  const { warmup, cooldown } = splitAroundIntervals(blocks);
  const pair = (i: number): CardioBlock[] => [
    { ...work, notes: `Ciclo ${i} de ${n}` },
    { ...rest, notes: `Ciclo ${i} de ${n}` },
  ];
  // Mantém os campos de cada bloco do par (elíptica/escada também), só repete.
  const cycles = Array.from({ length: n }, (_, k) => pair(k + 1)).flat();
  const out = [...warmup, ...cycles, ...cooldown];
  return { ...protocol, totalDurationMin: Math.round(out.reduce((s, b) => s + (b.durationSec || 0), 0) / 60), blocks: out };
}
