/**
 * Normalização do JSON estruturado devolvido pela IA (dieta).
 *
 * No modo JSON da Anthropic a resposta chega como argumento de uma ferramenta
 * sem schema de propriedades. Nessa situação o modelo às vezes devolve campos
 * aninhados como TEXTO JSON (ex.: "days": "[{...}]") ou embrulha o plano num
 * único campo (ex.: { "plan": {...} }). Sem esta normalização o servidor via
 * "Plano sem dias." e reprovava por food_targets_invalid com totais zerados.
 *
 * Só desfaz a serialização/embrulho; nenhum alimento, quantidade ou macro muda.
 */

const NESTED_KEYS = new Set([
  "meta",
  "targets",
  "trainingContext",
  "days",
  "meals",
  "items",
  "tips",
  "dailyAdjustments",
  "instructions",
]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function parseIfJsonText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

function deepNormalize(value: unknown, depth: number): unknown {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => deepNormalize(parseIfJsonText(v), depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = NESTED_KEYS.has(k) ? deepNormalize(parseIfJsonText(v), depth + 1) : deepNormalize(v, depth + 1);
  }
  // Um único dia enviado como objeto em vez de lista.
  if (isPlainObject(out.days) && Array.isArray((out.days as any).meals)) out.days = [out.days];
  return out;
}

export interface StructuredDietShape {
  keys: string[];
  daysType: string;
  dayCount: number;
}

export function describeStructuredDietShape(plan: unknown): StructuredDietShape {
  const obj = isPlainObject(plan) ? plan : {};
  const days = (obj as any).days;
  return {
    keys: Object.keys(obj).slice(0, 12),
    daysType: Array.isArray(days) ? "array" : days === null ? "null" : typeof days,
    dayCount: Array.isArray(days) ? days.length : 0,
  };
}

export function normalizeStructuredDietOutput(raw: unknown): any {
  let value = parseIfJsonText(raw);
  // Desembrulha { "plan": {...} } / { "json": "{...}" } até 3 níveis.
  for (let i = 0; i < 3; i++) {
    if (!isPlainObject(value) || "days" in value) break;
    const keys = Object.keys(value);
    if (keys.length !== 1) break;
    const inner = parseIfJsonText(value[keys[0]]);
    if (!isPlainObject(inner)) break;
    value = inner;
  }
  return deepNormalize(value, 0);
}
