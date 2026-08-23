/**
 * FONTE DE INCREMENTO DE CARGA (camada pura, auditável)
 * =====================================================
 *
 * Responde a UMA pergunta: qual é o menor incremento de carga disponível
 * para este aluno neste exercício?
 *
 * Hierarquia:
 *   1. configuração explícita (aluno + exercício) → confidence "high";
 *   2. histórico consistente de transições reais  → confidence "medium";
 *   3. desconhecido                                → confidence "low".
 *
 * Esta camada NÃO decide progressão, NÃO escreve no banco e NÃO conhece
 * React. `quantitativeProgression` recebe o resultado já resolvido.
 *
 * CONVENÇÃO DE PESO (auditada nos logs existentes):
 *   `exercise_set_logs.weight_kg` é o número digitado pelo aluno/treinador
 *   no campo "kg" da execução, sem qualquer transformação. Para barra é a
 *   carga total anunciada (barra + anilhas, como o aluno lê); para halteres
 *   é o valor do halter usado (por halter, não a soma dos dois), porque é o
 *   número escrito no equipamento. O incremento configurado deve ser expresso
 *   NA MESMA convenção do que é digitado — ex.: halteres 20→22 kg ⇒ 2 kg.
 *   Nenhum histórico é reinterpretado por esta camada.
 */

import type { ExerciseLog } from './weeklyProgression';
import { setRoleOf } from './weeklyProgression';

// ------------------------------------------------------------------
// Constantes centralizadas (unidade interna: gramas, para evitar float)
// ------------------------------------------------------------------

/** Menor incremento aceito como plausível. */
export const MIN_INCREMENT_KG = 0.25;
/** Maior incremento aceito (configurado ou inferido). */
export const MAX_INCREMENT_KG = 50;
/** Teto para inferência automática (mais conservador que o configurado). */
export const MAX_INFERRED_INCREMENT_KG = 10;
/** Tolerância de arredondamento em gramas ao testar múltiplos. */
export const MULTIPLE_TOLERANCE_G = 50;
/** Múltiplo máximo do passo-base aceito em uma única transição. */
export const MAX_STEP_MULTIPLE = 4;
/** Transições (mudanças reais de carga) mínimas para inferir. */
export const MIN_TRANSITIONS_FOR_INFERENCE = 3;
/** Ocorrências diretas mínimas do passo-base entre as transições. */
export const MIN_BASE_OCCURRENCES = 2;
/** Fração mínima das transições que devem ser exatamente o passo-base. */
export const MIN_BASE_SHARE = 0.5;
/** Carga absurda: acima disto o log é considerado anômalo e ignorado. */
export const MAX_PLAUSIBLE_LOAD_KG = 600;

/**
 * `exercise_set_logs` traz `session_id`, mas o tipo compartilhado
 * `ExerciseLog` (weeklyProgression, que não pode ser alterado) não o declara.
 * Extensão local, usada apenas para deduplicar séries repetidas.
 */
export type ComparableLog = ExerciseLog & { session_id?: string | null };

export type IncrementSource = 'configured' | 'inferred_history' | 'unknown';
export type IncrementConfidence = 'high' | 'medium' | 'low';

export interface IncrementEvidence {
  /** Série cronológica de cargas comparáveis considerada. */
  loadSeriesKg: number[];
  /** Transições não-zero (kg) entre cargas consecutivas. */
  transitionsKg: number[];
  /** Passo-base candidato detectado (kg) ou null. */
  baseStepKg: number | null;
  /** Quantas transições são exatamente o passo-base. */
  baseOccurrences: number;
  /** Logs descartados por filtro (aquecimento, drop, anômalos, duplicados). */
  excludedLogs: number;
  reason: string;
}

export interface ResolvedIncrement {
  incrementKg: number | null;
  source: IncrementSource;
  confidence: IncrementConfidence;
  evidence: IncrementEvidence;
}

export interface ResolveIncrementInput {
  /** Configuração explícita por aluno + exercício (kg), quando existir. */
  configuredIncrementKg?: number | null;
  /** Séries de trabalho históricas do MESMO aluno e MESMO exercício. */
  historicalWorkingSets?: ComparableLog[];
}

const gramsOf = (kg: number) => Math.round(kg * 1000);
const kgOf = (g: number) => Math.round(g) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------
// Chave aluno + exercício
// ------------------------------------------------------------------

/**
 * Chave estável usada na configuração explícita.
 * Não existe `exercise_instance_id` nem `exercise_id` em `exercise_set_logs`
 * (a coluna é `exercise_name`), e os planos guardam apenas o nome do
 * exercício — por isso a chave é o nome normalizado. Limitação documentada:
 * dois exercícios com nomes diferentes para o mesmo aparelho são entradas
 * distintas.
 */
export const normalizeExerciseKey = (name: string): string =>
  (name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ------------------------------------------------------------------
// Validação do valor configurado
// ------------------------------------------------------------------

export interface IncrementValidation {
  valid: boolean;
  value: number | null;
  error?: string;
}

/** Aceita decimais em kg (0,25 / 1,25 / 2,5 / 7 ...). Vazio = sem configuração. */
export const validateIncrementInput = (raw: string | number | null | undefined): IncrementValidation => {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { valid: true, value: null };
  }
  const parsed = Number(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(parsed)) {
    return { valid: false, value: null, error: 'Informe um número válido em kg.' };
  }
  if (parsed <= 0) {
    return { valid: false, value: null, error: 'O incremento deve ser maior que zero.' };
  }
  if (parsed < MIN_INCREMENT_KG) {
    return { valid: false, value: null, error: `O incremento mínimo aceito é ${MIN_INCREMENT_KG} kg.` };
  }
  if (parsed > MAX_INCREMENT_KG) {
    return { valid: false, value: null, error: `O incremento máximo aceito é ${MAX_INCREMENT_KG} kg.` };
  }
  return { valid: true, value: round2(parsed) };
};

// ------------------------------------------------------------------
// Série cronológica comparável
// ------------------------------------------------------------------

const timeOf = (l: ComparableLog): number => {
  const t = Date.parse(String(l.performed_at ?? ''));
  return Number.isFinite(t) ? t : 0;
};

/**
 * Séries comparáveis: apenas work/top (primary) do mesmo exercício/aluno,
 * com carga > 0 e plausível. Aquecimento, reconhecimento, backoff, drop,
 * rest-pause, myo-reps e técnicas ficam de fora — nunca definem incremento.
 * Duplicados exatos (mesma sessão + mesma série + mesma carga) são removidos.
 */
export const comparableWorkingSets = (logs: ComparableLog[] = []): { kept: ComparableLog[]; excluded: number } => {
  const seen = new Set<string>();
  const kept: ComparableLog[] = [];
  let excluded = 0;
  const ordered = [...logs].sort((a, b) => {
    const dt = timeOf(a) - timeOf(b);
    if (dt !== 0) return dt;
    return (Number(a.set_number) || 0) - (Number(b.set_number) || 0);
  });
  for (const l of ordered) {
    const w = Number(l.weight_kg);
    if (setRoleOf(l) !== 'primary' || !Number.isFinite(w) || w <= 0 || w > MAX_PLAUSIBLE_LOAD_KG) {
      excluded += 1;
      continue;
    }
    const key = `${l.session_id ?? l.performed_at ?? ''}|${l.set_number ?? ''}|${gramsOf(w)}|${l.reps ?? ''}`;
    if (seen.has(key)) {
      excluded += 1;
      continue;
    }
    seen.add(key);
    kept.push(l);
  }
  return { kept, excluded };
};

const emptyEvidence = (reason: string, excluded = 0): IncrementEvidence => ({
  loadSeriesKg: [],
  transitionsKg: [],
  baseStepKg: null,
  baseOccurrences: 0,
  excludedLogs: excluded,
  reason,
});

const unknown = (evidence: IncrementEvidence): ResolvedIncrement => ({
  incrementKg: null,
  source: 'unknown',
  confidence: 'low',
  evidence,
});

/**
 * Inferência a partir de TRANSIÇÕES REAIS (não da divisibilidade das cargas).
 *
 * Regra final:
 *  1. considerar apenas séries comparáveis, em ordem cronológica;
 *  2. deltas = |carga(n) − carga(n−1)|, descartando deltas zero (manutenção);
 *  3. exigir ao menos 3 transições não-zero;
 *  4. passo-base candidato = menor delta observado, dentro de 0,25–10 kg;
 *  5. toda transição deve ser múltiplo inteiro do passo-base (tolerância de
 *     50 g) e no máximo 4× o passo;
 *  6. o passo-base precisa aparecer diretamente ≥ 2 vezes e em ≥ 50% das
 *     transições (predominância);
 *  7. qualquer inconsistência ⇒ source = unknown (nunca chutar kg).
 */
export const inferIncrementFromTransitions = (logs: ComparableLog[] = []): ResolvedIncrement => {
  const { kept, excluded } = comparableWorkingSets(logs);
  const series = kept.map((l) => round2(Number(l.weight_kg)));
  if (series.length < 2) {
    return unknown(emptyEvidence('Histórico insuficiente: menos de duas séries de trabalho comparáveis.', excluded));
  }

  const deltasG: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const d = Math.abs(gramsOf(series[i]) - gramsOf(series[i - 1]));
    if (d > 0) deltasG.push(d); // manutenção (delta 0) nunca entra no cálculo
  }
  const transitionsKg = deltasG.map(kgOf);

  const evidenceBase = (reason: string, baseStepKg: number | null, baseOccurrences: number): IncrementEvidence => ({
    loadSeriesKg: series,
    transitionsKg,
    baseStepKg,
    baseOccurrences,
    excludedLogs: excluded,
    reason,
  });

  if (deltasG.length < MIN_TRANSITIONS_FOR_INFERENCE) {
    return unknown(
      evidenceBase(
        `Evidência insuficiente: ${deltasG.length} mudança(s) real(is) de carga (mínimo ${MIN_TRANSITIONS_FOR_INFERENCE}).`,
        null,
        0,
      ),
    );
  }

  const baseG = Math.min(...deltasG);
  if (baseG < gramsOf(MIN_INCREMENT_KG) || baseG > gramsOf(MAX_INFERRED_INCREMENT_KG)) {
    return unknown(
      evidenceBase('Menor variação observada fora da faixa plausível de incremento (0,25–10 kg).', null, 0),
    );
  }

  let baseOccurrences = 0;
  for (const d of deltasG) {
    const ratio = d / baseG;
    const nearest = Math.round(ratio);
    if (nearest < 1 || nearest > MAX_STEP_MULTIPLE) {
      return unknown(
        evidenceBase(
          `Transição de ${kgOf(d)} kg não é múltiplo aceitável do passo-base de ${kgOf(baseG)} kg.`,
          kgOf(baseG),
          0,
        ),
      );
    }
    if (Math.abs(d - nearest * baseG) > MULTIPLE_TOLERANCE_G) {
      return unknown(
        evidenceBase(
          `Padrão inconsistente: transição de ${kgOf(d)} kg não é múltiplo de ${kgOf(baseG)} kg.`,
          kgOf(baseG),
          0,
        ),
      );
    }
    if (nearest === 1) baseOccurrences += 1;
  }

  if (baseOccurrences < MIN_BASE_OCCURRENCES || baseOccurrences / deltasG.length < MIN_BASE_SHARE) {
    return unknown(
      evidenceBase(
        `Passo-base de ${kgOf(baseG)} kg sem predominância suficiente (${baseOccurrences}/${deltasG.length} transições).`,
        kgOf(baseG),
        baseOccurrences,
      ),
    );
  }

  const incrementKg = kgOf(baseG);
  return {
    incrementKg,
    source: 'inferred_history',
    confidence: 'medium',
    evidence: evidenceBase(
      `Incremento de ${incrementKg} kg inferido de ${deltasG.length} transições reais (${baseOccurrences} diretas).`,
      incrementKg,
      baseOccurrences,
    ),
  };
};

/** Ponto único de entrada: configuração explícita > histórico > desconhecido. */
export const resolveLoadIncrement = (input: ResolveIncrementInput): ResolvedIncrement => {
  const configured = validateIncrementInput(input.configuredIncrementKg ?? null);
  if (configured.valid && configured.value !== null) {
    return {
      incrementKg: configured.value,
      source: 'configured',
      confidence: 'high',
      evidence: emptyEvidence(`Incremento configurado de ${configured.value} kg (aluno + exercício).`),
    };
  }
  if (!configured.valid) {
    return unknown(emptyEvidence(`Configuração inválida ignorada: ${configured.error}`));
  }
  return inferIncrementFromTransitions(input.historicalWorkingSets ?? []);
};
