/**
 * Canonical Diet Plan schema.
 *
 * This is the source-of-truth structure produced by `diet-agent` and consumed
 * by the UI. Markdown is a derived presentation built from this object.
 *
 * Validation is intentionally lax in optional fields so that legacy plans
 * (markdown-only) can be best-effort lifted into the canonical shape without
 * breaking persistence.
 */
import { z } from 'zod';

export const DIET_PLAN_SCHEMA_VERSION = '1.0';

export const DietObjective = z.enum([
  'cutting',
  'bulking',
  'recomp',
  'manutencao',
  'performance',
  'precontest',
]);
export type DietObjective = z.infer<typeof DietObjective>;

export const DietStrategy = z.enum([
  'linear',
  'carb_cycle',
  'refeed',
  'diet_break',
  'low_carb',
  'if',
  'custom',
]);
export type DietStrategy = z.infer<typeof DietStrategy>;

export const DietStyle = z.enum([
  'tradicional',
  'mediterranea',
  'low_carb',
  'vegana',
  'vegetariana',
  'flexivel',
  'cetogenica',
  'paleo',
  'outra',
]);
export type DietStyle = z.infer<typeof DietStyle>;

export const DayLoadType = z.enum([
  'rest',
  'upper',
  'lower',
  'full',
  'push',
  'pull',
  'legs',
  'cardio',
  'tabata',
  'corrida',
  'mixed',
]);
export type DayLoadType = z.infer<typeof DayLoadType>;

export const DayIntensity = z.enum(['low', 'medium', 'high']);
export const DayPeriod = z.enum(['manha', 'tarde', 'noite']);
export const Weekday = z.enum([
  'seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom',
]);
export type Weekday = z.infer<typeof Weekday>;

export const DayLoad = z.object({
  type: DayLoadType,
  intensity: DayIntensity.optional(),
  timeOfDay: DayPeriod.optional(),
  notes: z.string().optional(),
});
export type DayLoad = z.infer<typeof DayLoad>;

export const TrainingContext = z.object({
  splitType: z.string().optional(),       // ex: "Upper/Lower", "PPL", "ABC", "Full"
  weeklySessions: z.number().int().min(0).max(14).optional(),
  defaultTime: DayPeriod.optional(),
  daysOfWeek: z.record(Weekday, DayLoad).optional(),
  summary: z.string().optional(),         // free-text resumo legível
});
export type TrainingContext = z.infer<typeof TrainingContext>;

export const Macros = z.object({
  kcal: z.number().min(0),
  p: z.number().min(0),
  c: z.number().min(0),
  g: z.number().min(0),
});
export type Macros = z.infer<typeof Macros>;

export const DietTargets = z.object({
  tmb: z.number().optional(),
  get: z.number().optional(),
  adjustmentPct: z.number().optional(),   // déficit (-) ou superávit (+) em %
  kcal: z.number().min(0),
  p: z.number().min(0),
  c: z.number().min(0),
  g: z.number().min(0),
  // percentuais derivados (opcionais, para UI)
  pPct: z.number().optional(),
  cPct: z.number().optional(),
  gPct: z.number().optional(),
});
export type DietTargets = z.infer<typeof DietTargets>;

export const MealItem = z.object({
  foodId: z.string().uuid().optional(),
  name: z.string().min(1),
  qtyGrams: z.number().min(0).optional(),
  portionLabel: z.string().optional(),    // ex: "1 colher de sopa", "1 unidade média"
  substitution: z.string().optional(),
  macros: Macros,
});
export type MealItem = z.infer<typeof MealItem>;

export const Meal = z.object({
  id: z.string(),
  name: z.string(),
  time: z.string().optional(),            // "07:00"
  order: z.number().int().min(0),
  items: z.array(MealItem),
  totals: Macros,
  notes: z.string().optional(),
});
export type Meal = z.infer<typeof Meal>;

export const DietDay = z.object({
  label: z.string(),                      // "Padrão" | "Segunda" | "Treino" | "Off"
  weekday: Weekday.optional(),
  carbBias: z.enum(['low', 'normal', 'high']).optional(),
  trainingDay: z.boolean().optional(),
  meals: z.array(Meal),
  totals: Macros,
});
export type DietDay = z.infer<typeof DietDay>;

export const ValidationIssue = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  path: z.string().optional(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

export const ValidationReport = z.object({
  status: z.enum(['ok', 'warning', 'invalid']),
  kcalDelta: z.number(),
  macroDeltas: z.object({
    p: z.number(),
    c: z.number(),
    g: z.number(),
  }),
  issues: z.array(ValidationIssue),
  recomputedAt: z.string(),               // ISO timestamp
});
export type ValidationReport = z.infer<typeof ValidationReport>;

export const DietPlanMeta = z.object({
  version: z.string().default(DIET_PLAN_SCHEMA_VERSION),
  generatedAt: z.string().optional(),
  model: z.string().optional(),
  objective: DietObjective.optional(),
  strategy: DietStrategy.optional(),
  style: DietStyle.optional(),
  phase: z.string().optional(),
  mealCount: z.number().int().min(1).max(10).optional(),
  restrictions: z.array(z.string()).optional(),
  preferences: z.array(z.string()).optional(),
  trainingAware: z.boolean().optional(),
  decision: z.enum(['manter', 'ajustar', 'nova', 'pedir_dados']).optional(),
  confidence: z.number().min(0).max(100).optional(),
  rationale: z.string().optional(),
});
export type DietPlanMeta = z.infer<typeof DietPlanMeta>;

export const DietPlan = z.object({
  meta: DietPlanMeta,
  targets: DietTargets,
  trainingContext: TrainingContext.optional(),
  days: z.array(DietDay).min(1),
  tips: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  whatsappMessages: z.array(z.string()).optional(),
  validation: ValidationReport.optional(),
});
export type DietPlan = z.infer<typeof DietPlan>;

/**
 * Strict parse — used for fresh AI output.
 */
export const parseDietPlanStrict = (raw: unknown) => DietPlan.safeParse(raw);

/**
 * Loose parse — used when loading from DB. Tolerates missing optional fields
 * by filling defaults; if it cannot be coerced, returns null and the caller
 * should fall back to markdown.
 */
export const parseDietPlanLoose = (raw: unknown): DietPlan | null => {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = DietPlan.safeParse(raw);
  if (parsed.success) return parsed.data;
  return null;
};

/**
 * Minimal JSON schema for OpenAI structured output (`response_format`).
 * Kept simpler than the Zod version to fit OpenAI's `json_schema` constraints
 * (which doesn't accept every Zod feature). The Zod parser is still used as
 * the runtime gatekeeper after the response arrives.
 */
export const DIET_PLAN_JSON_SCHEMA = {
  name: 'diet_plan',
  strict: false,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['meta', 'targets', 'days'],
    properties: {
      meta: {
        type: 'object',
        additionalProperties: true,
        properties: {
          version: { type: 'string' },
          objective: { type: 'string' },
          strategy: { type: 'string' },
          style: { type: 'string' },
          phase: { type: 'string' },
          mealCount: { type: 'number' },
          trainingAware: { type: 'boolean' },
          decision: { type: 'string' },
          confidence: { type: 'number' },
          rationale: { type: 'string' },
        },
      },
      targets: {
        type: 'object',
        additionalProperties: true,
        required: ['kcal', 'p', 'c', 'g'],
        properties: {
          tmb: { type: 'number' },
          get: { type: 'number' },
          kcal: { type: 'number' },
          p: { type: 'number' },
          c: { type: 'number' },
          g: { type: 'number' },
        },
      },
      trainingContext: {
        type: 'object',
        additionalProperties: true,
      },
      days: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: true,
          required: ['label', 'meals', 'totals'],
          properties: {
            label: { type: 'string' },
            weekday: { type: 'string' },
            carbBias: { type: 'string' },
            trainingDay: { type: 'boolean' },
            totals: {
              type: 'object',
              required: ['kcal', 'p', 'c', 'g'],
              properties: {
                kcal: { type: 'number' },
                p: { type: 'number' },
                c: { type: 'number' },
                g: { type: 'number' },
              },
            },
            meals: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                additionalProperties: true,
                required: ['id', 'name', 'order', 'items', 'totals'],
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  time: { type: 'string' },
                  order: { type: 'number' },
                  totals: {
                    type: 'object',
                    required: ['kcal', 'p', 'c', 'g'],
                    properties: {
                      kcal: { type: 'number' },
                      p: { type: 'number' },
                      c: { type: 'number' },
                      g: { type: 'number' },
                    },
                  },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['name', 'macros'],
                      properties: {
                        name: { type: 'string' },
                        qtyGrams: { type: 'number' },
                        portionLabel: { type: 'string' },
                        substitution: { type: 'string' },
                        macros: {
                          type: 'object',
                          required: ['kcal', 'p', 'c', 'g'],
                          properties: {
                            kcal: { type: 'number' },
                            p: { type: 'number' },
                            c: { type: 'number' },
                            g: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      tips: { type: 'array', items: { type: 'string' } },
      notes: { type: 'array', items: { type: 'string' } },
      whatsappMessages: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;