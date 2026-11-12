/**
 * Pesar refeição — "Prato pronto": uma foto do prato montado; a IA identifica
 * cada alimento e ESTIMA as gramas. Regras puras: normalizar a resposta,
 * distribuir o peso lido na balança entre os alimentos (a soma bate com o
 * total), a pergunta da tara do prato, casar com o plano e montar os itens
 * marcados origem = 'estimado'. Nada aqui chama a IA, o banco ou o navegador.
 */
import {
  buildWeighedItem, pendingPlanFoods, resolveScanWeigh, round1,
  type PlannedMeal, type WeighFood, type WeighedItem,
} from './index';
import { NO_CALIBRATION, applyCalibration, newEstimateId, type CalibrationFactor, type PromptCorrection } from './calibration';

export const PLATE_HINT = 'Foto de cima, com o prato inteiro. Um garfo ou a mão perto ajuda a IA a medir.';
export const ESTIMATED_WARNING = 'Gramas estimadas pela foto — para precisão, use a balança.';
export const PLATE_TARE_QUESTION = 'A balança estava zerada com o prato?';

export interface PlateAiItem {
  alimento: string;
  alternativas: string[];
  gramas_estimadas: number;
  faixa_gramas: [number, number] | null;
  confianca: number;
}
export interface PlateAiResult {
  itens: PlateAiItem[];
  peso_total_lido: number | null;
  prato_tarado: boolean | null;
  observacao: string;
  /** A IA viu uma balança, mas o visor não aparecia/não dava para ler. */
  balanca_sem_visor: boolean;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/[^\d.]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Resposta da IA conferida no app também (nunca confiar só no servidor). */
export function normalizePlateEstimate(raw: unknown): PlateAiResult | null {
  const o = raw as any;
  if (!o || typeof o !== 'object' || !Array.isArray(o.itens)) return null;
  const itens: PlateAiItem[] = o.itens
    .map((it: any) => {
      const f = Array.isArray(it?.faixa_gramas) ? it.faixa_gramas.map(num) : [];
      const lo = f[0] != null && f[0] > 0 ? Math.round(f[0]) : null;
      const hi = f[1] != null && f[1] > 0 ? Math.round(f[1]) : null;
      let c = num(it?.confianca) ?? 0;
      if (c > 1) c /= 100;
      return {
        alimento: String(it?.alimento ?? '').trim(),
        alternativas: (Array.isArray(it?.alternativas) ? it.alternativas : []).map((x: unknown) => String(x ?? '').trim()).filter(Boolean).slice(0, 3),
        gramas_estimadas: Math.max(0, Math.round(num(it?.gramas_estimadas) ?? 0)),
        faixa_gramas: lo != null && hi != null ? [Math.min(lo, hi), Math.max(lo, hi)] as [number, number] : null,
        confianca: Math.max(0, Math.min(1, c)),
      };
    })
    .filter((it: PlateAiItem) => it.alimento);
  if (itens.length === 0) return null;
  const total = num(o.peso_total_lido);
  const hasTotal = total != null && total > 0;
  return {
    itens,
    peso_total_lido: hasTotal ? round1(total!) : null,
    prato_tarado: hasTotal && typeof o.prato_tarado === 'boolean' ? o.prato_tarado : null,
    observacao: String(o.observacao ?? '').trim(),
    balanca_sem_visor: !hasTotal && o.balanca_sem_visor === true,
  };
}

/**
 * Divide `total` gramas na proporção dos pesos (estimativas da IA), em gramas
 * inteiras, com a soma exatamente igual ao total arredondado (maior resto).
 * Sem estimativas (tudo zero), divide igual.
 */
export function distributeToTotal(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const T = Math.max(0, Math.round(Number(total) || 0));
  const w = weights.map((x) => Math.max(0, Number(x) || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const shares = sum > 0 ? w.map((x) => (x / sum) * T) : w.map(() => T / n);
  const floors = shares.map(Math.floor);
  let rest = T - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => ({ i, r: s - Math.floor(s) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest--) floors[order[k].i] += 1;
  return floors;
}

/**
 * Quando perguntar "A balança estava zerada com o prato?": a IA disse que o
 * prato está no peso, ou não soube e o visor passa muito do que a comida
 * parece pesar (prato junto).
 */
export function plateNeedsTareQuestion(ai: Pick<PlateAiResult, 'itens' | 'peso_total_lido' | 'prato_tarado'>): boolean {
  if (ai.peso_total_lido == null) return false;
  if (ai.prato_tarado === true) return false;
  if (ai.prato_tarado === false) return true;
  const est = ai.itens.reduce((a, it) => a + (Number(it.gramas_estimadas) || 0), 0);
  return ai.peso_total_lido > est * 1.35 + 60;
}

/** Peso sugerido do prato quando a balança não estava zerada: visor − comida estimada. */
export function suggestedPlateGrams(ai: Pick<PlateAiResult, 'itens' | 'peso_total_lido'>): number {
  if (ai.peso_total_lido == null) return 0;
  const est = ai.itens.reduce((a, it) => a + (Number(it.gramas_estimadas) || 0), 0);
  return Math.max(0, Math.round(ai.peso_total_lido - est));
}

/** Resposta da pergunta da tara: zerada, ou o prato estava junto com tantas gramas. */
export type PlateTareAnswer = { kind: 'zerada' } | { kind: 'com_prato'; pratoGramas: number };

/**
 * Gramas de comida a distribuir: o visor (zerada), o visor menos o prato, ou
 * null (sem balança legível, ou pergunta ainda sem resposta → ficam as estimativas).
 */
export function plateFoodTotal(ai: PlateAiResult, answer: PlateTareAnswer | null): number | null {
  if (ai.peso_total_lido == null) return null;
  if (!plateNeedsTareQuestion(ai)) return ai.peso_total_lido;
  if (!answer) return null;
  if (answer.kind === 'zerada') return ai.peso_total_lido;
  return Math.max(0, ai.peso_total_lido - Math.max(0, Number(answer.pratoGramas) || 0));
}

/** Linha da revisão do prato. */
export interface PlateRow {
  key: string;
  /** Nome que a IA deu ('' = adicionado pelo aluno). */
  aiName: string;
  aiAlternatives: string[];
  confianca: number;
  /** Gramas ORIGINAIS da IA (base das correções). */
  aiEstimate: number;
  /** Estimativa sugerida: a da IA já calibrada (peso na distribuição do total). */
  estimate: number;
  /** Faixa da IA, calibrada junto. */
  faixa: [number, number] | null;
  /** Calibração aplicada (fator 1 = sem ajuste). */
  calibration: CalibrationFactor;
  food: WeighFood | null;
  planIndex: number | null;
  alternatives: WeighFood[];
  grams: string;
  /** O aluno digitou as gramas: fica fixa e o resto do total se divide entre os outros. */
  gramsEdited: boolean;
  /** O aluno trocou o alimento da IA. */
  foodEdited: boolean;
}

const asItem = (row: PlateRow): WeighedItem | null => {
  const g = Number(String(row.grams).replace(',', '.'));
  return row.food ? buildWeighedItem(row.food, g > 0 ? g : 0, { planIndex: row.planIndex }) : null;
};

/**
 * Casa cada alimento do prato com a base e o plano (preferindo os previstos
 * ainda não registrados), um por vez para dois itens não ocuparem o mesmo
 * alimento do plano. `existing` = itens já salvos na refeição (pesagem
 * incremental).
 */
export function resolvePlateRows(
  ai: PlateAiResult,
  foods: WeighFood[],
  planned: PlannedMeal,
  existing: WeighedItem[] = [],
  factorFor?: ((food: WeighFood | null, aiName: string) => CalibrationFactor) | null,
): PlateRow[] {
  const context: WeighedItem[] = [...existing];
  return ai.itens.map((it, i) => {
    const res = resolveScanWeigh(
      { alimento: it.alimento, alimento_alternativas: it.alternativas, confianca_alimento: it.confianca },
      foods, planned, context,
    );
    const calibration = (factorFor && it.gramas_estimadas > 0 ? factorFor(res.food, it.alimento) : null) ?? NO_CALIBRATION;
    const adjusted = applyCalibration(it.gramas_estimadas, it.faixa_gramas, calibration.factor);
    const row: PlateRow = {
      key: `ia-${i}`,
      aiName: it.alimento,
      aiAlternatives: it.alternativas,
      confianca: it.confianca,
      aiEstimate: it.gramas_estimadas,
      estimate: adjusted.grams,
      faixa: adjusted.range,
      calibration,
      food: res.food,
      planIndex: res.planIndex,
      alternatives: res.alternatives,
      grams: adjusted.grams > 0 ? String(adjusted.grams) : '',
      gramsEdited: false,
      foodEdited: false,
    };
    const asW = asItem(row);
    if (asW) context.push(asW);
    return row;
  });
}

/**
 * Aplica o total de comida às linhas: as gramas digitadas pelo aluno ficam; o
 * resto do total se divide entre as outras na proporção das estimativas.
 * Sem total, cada linha não editada volta à estimativa da IA.
 */
export function applyPlateTotal(rows: PlateRow[], total: number | null): PlateRow[] {
  const free = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.gramsEdited && r.estimate >= 0 && r.aiName);
  if (total == null) {
    return rows.map((r) => (r.gramsEdited || !r.aiName ? r : { ...r, grams: r.estimate > 0 ? String(r.estimate) : '' }));
  }
  const fixed = rows.filter((r) => r.gramsEdited || !r.aiName)
    .reduce((a, r) => a + (Number(String(r.grams).replace(',', '.')) || 0), 0);
  const parts = distributeToTotal(free.map(({ r }) => r.estimate), Math.max(0, total - fixed));
  const next = [...rows];
  free.forEach(({ r, i }, k) => { next[i] = { ...r, grams: String(parts[k]) }; });
  return next;
}

/** Faixa mostrada: a da IA, escalada junto quando as gramas foram ajustadas ao total. */
export function plateRowRange(row: Pick<PlateRow, 'estimate' | 'faixa' | 'grams'>): [number, number] | null {
  if (!row.faixa) return null;
  const g = Number(String(row.grams).replace(',', '.')) || 0;
  const k = row.estimate > 0 && g > 0 ? g / row.estimate : 1;
  return [Math.round(row.faixa[0] * k), Math.round(row.faixa[1] * k)];
}

/** "~150 g, entre 120 e 180 g" */
export function formatPlateRange(grams: number, range: [number, number] | null): string {
  const g = `~${Math.round(Number(grams) || 0)} g`;
  return range ? `${g}, entre ${range[0]} e ${range[1]} g` : g;
}

/** Linha válida: alimento escolhido e gramas > 0. */
export const plateRowValid = (r: PlateRow) => !!r.food && Number(String(r.grams).replace(',', '.')) > 0;

/** Itens do prato prontos para entrar na refeição, todos com origem = 'estimado'. */
export function buildEstimatedItems(rows: PlateRow[], newId: () => string = newEstimateId): WeighedItem[] {
  return rows.filter(plateRowValid).map((r) => {
    const g = Number(String(r.grams).replace(',', '.'));
    const item = buildWeighedItem(r.food!, g, {
      edited: r.foodEdited || r.gramsEdited || !r.aiName,
      aiName: r.aiName || null,
      readGrams: null,
      planIndex: r.planIndex,
    });
    if (r.foodEdited && r.aiName) item.alimento_corrigido = true;
    item.origem = 'estimado';
    item.faixa_gramas = plateRowRange(r);
    // Só estimativas da IA aprendem: guarda a original, a sugerida e se o aluno mexeu nas gramas.
    if (r.aiName && r.aiEstimate > 0) {
      item.estimativa_id = newId();
      item.gramas_estimadas = r.aiEstimate;
      item.gramas_ajustadas = r.estimate;
      item.fator_calibracao = r.calibration.factor;
      item.gramas_corrigidas = r.gramsEdited;
    }
    return item;
  });
}

/** Linha nova "Adicionar alimento que faltou". */
export function blankPlateRow(key: string): PlateRow {
  return {
    key, aiName: '', aiAlternatives: [], confianca: 1, aiEstimate: 0, estimate: 0, faixa: null, calibration: NO_CALIBRATION,
    food: null, planIndex: null, alternatives: [], grams: '', gramsEdited: true, foodEdited: true,
  };
}

/** Alimentos do plano ainda livres para uma linha (não registrados e não usados por outra linha). */
export function freePlanIndexesForRow(planned: PlannedMeal, existing: WeighedItem[], rows: PlateRow[], rowIndex: number): number[] {
  const used = new Set(rows.filter((_, i) => i !== rowIndex).map((r) => r.planIndex).filter((x): x is number => typeof x === 'number'));
  return pendingPlanFoods(planned, existing).map((p) => p.index).filter((i) => !used.has(i));
}

/** Corpo da chamada `plate_estimate` (previstos e já registrados como contexto). */
export function buildPlateEstimateRequest(input: { photo: string; mealName: string; planned: PlannedMeal; items: WeighedItem[]; corrections?: PromptCorrection[] }) {
  return {
    action: 'plate_estimate' as const,
    image: input.photo,
    mealName: input.mealName,
    planFoods: (input.planned?.alimentos ?? []).map((f) => f.alimento).filter(Boolean),
    pendingPlanFoods: pendingPlanFoods(input.planned, input.items).map((p) => p.food.alimento),
    addedFoods: (input.items ?? []).map((i) => ({ alimento: i.alimento, gramas: i.gramas })),
    /** Últimas correções do aluno, como exemplos para a IA estimar melhor. */
    corrections: (input.corrections ?? []).slice(0, 5),
  };
}
