// Regras puras do TABATA: dia do plano, edição de rounds, "Repetir padrão",
// resumo do card e as regras do gerador (montagem rápida, semana, treino do dia).
import type { ParsedTabata, TabataBlock, TabataExercise } from './tabataParser';

export const TABATA_WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;

export const normalizeTabataName = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

// ───────────────────────── Dia do plano ─────────────────────────

/** "Quinta — TABATA ..." → "Quinta" (forma canônica); sem dia → null. */
export function tabataDayFromTitle(titulo: string | null | undefined): string | null {
  const head = normalizeTabataName(titulo || '');
  for (const day of TABATA_WEEKDAYS) {
    const key = normalizeTabataName(day);
    if (head === key || head.startsWith(`${key} `) || head.startsWith(`${key}—`) || head.startsWith(`${key}-`)) return day;
  }
  return null;
}

export interface TabataPlanRef { id: string; titulo: string | null; created_at: string }

/** Plano mais recente de cada dia (o mesmo que o aluno enxerga como "o TABATA de Terça"). */
export function latestTabataPlanByDay(plans: TabataPlanRef[]): Map<string, TabataPlanRef> {
  const byDay = new Map<string, TabataPlanRef>();
  for (const p of plans) {
    const day = tabataDayFromTitle(p.titulo);
    if (!day) continue;
    const cur = byDay.get(day);
    if (!cur || new Date(p.created_at).getTime() > new Date(cur.created_at).getTime()) byDay.set(day, p);
  }
  return byDay;
}

export type TabataDayChange =
  | { kind: 'load'; planId: string }
  | { kind: 'same' }
  | { kind: 'move' };

/**
 * Troca do dia no seletor "Edição": se o dia já tem TABATA, abre esse plano;
 * se o dia é o do próprio plano, nada muda; senão o plano atual só muda de dia ao salvar.
 */
export function resolveTabataDayChange(
  plans: TabataPlanRef[],
  currentPlanId: string | null,
  day: string,
): TabataDayChange {
  if (!day || day === 'none') return { kind: 'move' };
  const target = latestTabataPlanByDay(plans).get(day);
  if (!target) return { kind: 'move' };
  if (target.id === currentPlanId) return { kind: 'same' };
  return { kind: 'load', planId: target.id };
}

// ───────────────────────── Edição de rounds ─────────────────────────

/** Trocar o exercício do round limpa a observação antiga (ela era do exercício anterior). */
export function changeRoundExercise(ex: TabataExercise, name: string): TabataExercise {
  if (normalizeTabataName(name) === normalizeTabataName(ex.name)) return { ...ex, name };
  return { ...ex, name, observation: '' };
}

const isFiller = (name: string) => /^(ALONGAMENTO|MOBILIDADE|RESPIRACAO|LIBERACAO)\b/.test(normalizeTabataName(name));

/** Exercícios diferentes do bloco, na ordem em que aparecem. */
export function distinctBlockExercises(block: TabataBlock): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ex of block.exercises) {
    const key = normalizeTabataName(ex.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(ex.name.trim());
  }
  return out;
}

/** Sugestão inicial do "Repetir padrão": os primeiros N exercícios diferentes do bloco. */
export function defaultPatternNames(block: TabataBlock, size: number): string[] {
  const names = distinctBlockExercises(block);
  return Array.from({ length: size }, (_, i) => names[i] ?? '');
}

/**
 * "Repetir padrão": preenche os N rounds do bloco em A-B-C-D-A-B-C-D…
 * Cada round mantém o trabalho/descanso que já tinha (rounds novos usam os do bloco).
 * A observação acompanha o exercício quando ele já tinha uma no bloco.
 */
export function fillBlockPattern(block: TabataBlock, names: string[]): TabataBlock {
  const pattern = names.map(n => n.trim()).filter(Boolean);
  if (!pattern.length) return block;
  const total = Math.max(1, Math.floor(block.rounds || pattern.length));
  const obsByName = new Map<string, string>();
  for (const ex of block.exercises) {
    const key = normalizeTabataName(ex.name);
    if (ex.observation && !obsByName.has(key)) obsByName.set(key, ex.observation);
  }
  const exercises: TabataExercise[] = Array.from({ length: total }, (_, i) => {
    const name = pattern[i % pattern.length];
    const prev = block.exercises[i];
    return {
      name,
      workSeconds: prev?.workSeconds ?? block.workSeconds,
      restSeconds: prev?.restSeconds ?? block.restSeconds,
      observation: obsByName.get(normalizeTabataName(name)) ?? '',
    };
  });
  return { ...block, rounds: total, exercises };
}

export const patternLetters = (size: number, rounds: number) =>
  Array.from({ length: Math.max(1, rounds) }, (_, i) => String.fromCharCode(65 + (i % size))).join('-');

// ───────────────────────── Resumo do card ─────────────────────────

/** "GLOBET SQUATS" → "Globet squats"; nomes já em caixa mista ficam como estão. */
export function displayExerciseName(name: string): string {
  const n = (name || '').trim();
  if (!n || n !== n.toUpperCase()) return n;
  const lower = n.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

export function blockExerciseSummary(parsed: ParsedTabata): { label: string; text: string }[] {
  return parsed.blocks
    .map((b, i) => ({ label: `Bloco ${i + 1}`, text: distinctBlockExercises(b).map(displayExerciseName).join(', ') }))
    .filter(r => r.text);
}

// ───────────────────────── Gerador ─────────────────────────

export type TrainingDayKind = 'inferiores' | 'superiores' | 'core_abs' | 'full_body' | 'auto';

/** Grupo do dia de musculação a partir do nome ("Segunda - Inferiores (A)"). */
export function trainingDayKind(dayName: string | null | undefined): TrainingDayKind {
  const lower = (dayName || '').toLowerCase();
  if (/inferior|perna|quadr[ií]cep|glút|glute|posterior|panturr/i.test(lower)) return 'inferiores';
  if (/superior|peito|peitoral|costas|dorsal|ombro|delt[oó]id|b[ií]cep|tr[ií]cep|bra[çc]o/i.test(lower)) return 'superiores';
  if (/abd[oô]m|core|prancha/i.test(lower)) return 'core_abs';
  if (/full|completo|corpo todo|total/i.test(lower)) return 'full_body';
  return 'auto';
}

// Barra em rack/anilhas, smith, máquinas, cabos, bancos/caixas e cardio de aparelho.
const SLOW_SETUP = /\b(SMITH|HACK|MAQ|MAQUINA|MACHINE|GRAVITON|PECK|CROSS ?OVER|MESA|CADEIRA|POLIA|CABO|LEG PRESS|LEG 180|PULL ?DOWN|PUXADA|BARRA|W|FIXA|ART|ARTICULADO|BANCO|CAIXA|STEPS?|BOLA|RODA|TRX|PARALELA|CAVALINHO|SCOTT|HIPEREXTENSAO|NORDICA|ROMENO|PESO MORTO|TERRA|BULGARO|LIVRE|AIR BIKE|BIKE|REMO|ESTEIRA|PASSADEIRA|ELIPTICO|ESCADA|SKI|CORRIDA INTERVALADA|SUPRA PESO|ANILHA|RACK)\b/;
// Musculação isolada / de hipertrofia que não cabe num TABATA.
const ISOLATED = /\b(STIFF UNILATERAL|SUMO|ELEVACAO PELVICA|HIP THRUST|CRUCIFIXO|VOADOR|FLY|ROSCA|BICEPS|MARTELO|TRICEPS|DESENV|DESENVOLVIMENTO|ARNOLD|SHRUG|ENCOLHIMENTO|PANTURRILHA|GEMEOS|ELEVACAO (LATERAL|FRONTAL|UNIL)|FACE ?PULL|FACEPULL|REAR DELT|KICK BACK|ABDUCAO|FLEXORA|EXTENSORA|PUNHO|REMADA|SUPINO|GOOD MORNING|ESTABILIDADE)\b/;
// Peso corporal, halter, kettlebell, corda naval e elástico.
const QUICK_ALLOW = /\b(BURPEES?|MOUTAIN|MOUNTAIN|POLICHINELO|SKIPS?|JUMPING|JUMPS?|SALTO|PRANCHA|FLEXAO DE BRACO|FLEXAO\+ALPINISTA|ALPINISTA|AGACHAMENTO|SQUATS?|GLOBET|GOBLET|AFUNDO|PASSADAS?|PASSADA|SWING|KETTLEBELL|CORDA NAVAL|BEAR TO PLANK|TESOURINHA|ABS|ABDOMINAL|CANIVETE|PONTE DE GLUTEO|STIFF HALTERES|RDL HALTERES|THRUSTERS?|ELASTICO|MINI ?BAND|ISOMETRIA|ALONGAMENTO)\b/;
const QUICK_GROUPS = new Set(['CARDIO', 'ABDOMEN', 'CORE', 'MOBILIDADE']);

/** Barra/anilha, smith, máquina, cabo ou musculação isolada. */
export const isSlowSetupExercise = (nome: string) => {
  const n = normalizeTabataName(nome);
  return SLOW_SETUP.test(n) || ISOLATED.test(n);
};

/** Só exercícios de montagem rápida (peso corporal, halter, kettlebell, corda naval, elástico). */
export function isQuickSetupExercise(nome: string, grupo?: string | null): boolean {
  const n = normalizeTabataName(nome);
  if (!n) return false;
  if (SLOW_SETUP.test(n) || ISOLATED.test(n)) return false;
  return QUICK_GROUPS.has(normalizeTabataName(grupo || '')) || QUICK_ALLOW.test(n);
}

// Empurrar / apoio pesado de braço — fora em dia de superiores.
const ARM_SUPPORT = /\b(BURPEES?|FLEXAO|ALPINISTA|BEAR TO PLANK|PRANCHA REVERSA)\b/;
// Saltos e afundos — volume baixo em dia de inferiores.
const JUMP_LUNGE = /\b(JUMPS?|JUMPING|SALTO|BURPEES?|SKIPS?|AFUNDO|PASSADAS?|PASSADA)\b/;

export const isArmSupportExercise = (nome: string) => ARM_SUPPORT.test(normalizeTabataName(nome));
export const isJumpOrLungeExercise = (nome: string) => JUMP_LUNGE.test(normalizeTabataName(nome));

export interface CatalogExercise { nome: string; grupo_muscular?: string | null; video_embed?: string | null }

/** Lista oficial enviada à IA para um dia: montagem rápida e, em dia de superiores, sem apoio pesado de braço. */
export function tabataCatalogForDay<T extends CatalogExercise>(exercises: T[], dayKind: TrainingDayKind = 'auto'): T[] {
  return exercises.filter(ex => {
    if (!ex?.nome || !ex.video_embed) return false;
    if (!isQuickSetupExercise(ex.nome, ex.grupo_muscular)) return false;
    if (dayKind === 'superiores' && isArmSupportExercise(ex.nome)) return false;
    return true;
  });
}

const REPLACEMENT_RULES: [RegExp, string][] = [
  [/\b(AGACHAMENTO|SQUATS?|HACK|LEG PRESS|LEG 180|SUMO)\b/, 'GLOBET SQUATS'],
  [/\b(AFUNDO|BULGARO|PASSADAS?)\b/, 'AFUNDO HALTERES'],
  [/\bSTIFF\b/, 'STIFF HALTERES'],
  [/\b(PESO MORTO|RDL|GOOD MORNING|TERRA)\b/, 'RDL HALTERES'],
  [/\b(SUPINO|PECK|CRUCIFIXO|FLY|CROSS ?OVER|PARALELA)\b/, 'FLEXAO DE BRACO'],
];

/** Versão de montagem rápida de um exercício com barra/smith/máquina (ex.: AGACHAMENTO LIVRE → GLOBET SQUATS). */
export function quickSetupReplacement(nome: string, catalogNames: string[]): string | null {
  const n = normalizeTabataName(nome);
  if (!n || !isSlowSetupExercise(nome)) return null;
  for (const [re, target] of REPLACEMENT_RULES) {
    if (!re.test(n)) continue;
    const hit = catalogNames.find(c => normalizeTabataName(c) === target);
    return hit ?? null;
  }
  return null;
}

/**
 * Correção determinística depois da IA: troca, nas tabelas dos blocos, exercícios com barra/smith/máquina
 * pela versão de montagem rápida do catálogo. Só mexe na coluna do exercício; o resto do texto fica igual.
 */
export function enforceQuickSetup(markdown: string, catalogNames: string[]): { markdown: string; replaced: [string, string][] } {
  const replaced: [string, string][] = [];
  let inBlock = false;
  const lines = (markdown || '').split('\n').map(line => {
    const t = line.trim();
    if (/^###\s+/.test(t)) inBlock = true;
    else if (/^##\s+/.test(t)) inBlock = false;
    if (!inBlock || !t.startsWith('|') || /^\|[\s\-:|]+\|$/.test(t)) return line;
    const cells = line.split('|');
    if (cells.length < 4) return line;
    const raw = cells[2];
    const name = raw.replace(/\*+/g, '').trim();
    if (!name || /^exerc/i.test(name) || name === '...') return line;
    const swap = quickSetupReplacement(name, catalogNames);
    if (!swap) return line;
    replaced.push([name, swap]);
    cells[2] = raw.replace(raw.trim(), swap);
    return cells.join('|');
  });
  return { markdown: lines.join('\n'), replaced };
}

export interface TabataCheckContext {
  dayKind?: TrainingDayKind;
  /** Exercícios dos outros dias de TABATA da mesma semana. */
  otherDaysExercises?: string[];
}

/** Avisos para o personal conferir antes de salvar. Não altera nada. */
export function tabataPlanWarnings(parsed: ParsedTabata, ctx: TabataCheckContext = {}): string[] {
  const warnings: string[] = [];
  const other = new Set((ctx.otherDaysExercises || []).map(normalizeTabataName));
  const repeated = new Set<string>();
  parsed.blocks.forEach((b, i) => {
    const names = distinctBlockExercises(b).filter(n => !isFiller(n));
    const label = `Bloco ${i + 1}`;
    if (names.length < 4) warnings.push(`${label} tem ${names.length} exercício${names.length === 1 ? '' : 's'} diferente${names.length === 1 ? '' : 's'} (mínimo 4).`);
    const slow = names.filter(isSlowSetupExercise);
    if (slow.length) warnings.push(`${label}: ${slow.map(displayExerciseName).join(', ')} não é de montagem rápida.`);
    if (ctx.dayKind === 'superiores') {
      const arm = names.filter(isArmSupportExercise);
      if (arm.length) warnings.push(`${label}: dia de superiores com ${arm.map(displayExerciseName).join(', ')}.`);
    }
    if (ctx.dayKind === 'inferiores') {
      const jl = names.filter(isJumpOrLungeExercise);
      if (jl.length > 1) warnings.push(`${label}: dia de inferiores com muitos saltos/afundos (${jl.map(displayExerciseName).join(', ')}).`);
    }
    names.forEach(n => { if (other.has(normalizeTabataName(n))) repeated.add(displayExerciseName(n)); });
  });
  if (repeated.size) warnings.push(`Repete de outro dia da semana: ${[...repeated].join(', ')}.`);
  return warnings;
}

/** Nomes dos exercícios dos blocos (para não repetir nos outros dias). */
export function tabataBlockExerciseNames(parsed: ParsedTabata): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of parsed.blocks) for (const n of distinctBlockExercises(b)) {
    const k = normalizeTabataName(n);
    if (!seen.has(k)) { seen.add(k); out.push(n); }
  }
  return out;
}
