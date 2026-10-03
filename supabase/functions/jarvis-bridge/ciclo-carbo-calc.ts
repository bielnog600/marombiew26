/**
 * Ciclo de carboidrato do Jarvis — MESMA conta do app (src/lib/carbCycling.ts, Fase 3).
 * Módulo puro (sem rede), só usado pela ponte.
 *
 *  - variable_calories: P e G = macros canônicos da meta base; C = g/kg × peso;
 *    kcal = 4P + 4C + 9G (consequência).
 *  - fixed_calories: kcal = meta base (ou kcal do tipo); C = g/kg × peso;
 *    o macro de fechamento (proteína ou gordura) fecha as calorias; o outro fica fixo.
 *  - Padrões do app: LOW 1,5 · MEDIUM 2,5 · HIGH 3,5 g/kg; seg–sex MEDIUM, sáb/dom LOW.
 *  - Sugestão por treino = suggestCarbDayTypeForWorkout: descanso/cardio → LOW,
 *    perna/lower/quadríceps/glúteo/posterior/full body → HIGH, resto → MEDIUM.
 *
 * Saída gravada igual à página DietaIA: protocols.carb_cycling (config do app) e
 * protocols.weekly_day_targets {seg..dom: {kcal,p,c,g,type}}.
 */

export type Rec = Record<string, unknown>;
export type Weekday = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
export type TipoDia = "low" | "medium" | "high";
export type Modo = "variable_calories" | "fixed_calories";

export const WEEKDAYS: Weekday[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
export const TIPOS: TipoDia[] = ["low", "medium", "high"];
export const NOME_DIA: Record<Weekday, string> = {
  seg: "Segunda",
  ter: "Terça",
  qua: "Quarta",
  qui: "Quinta",
  sex: "Sexta",
  sab: "Sábado",
  dom: "Domingo",
};

export interface TipoConfig {
  carbsPerKg: number | null;
  carbGrams: number | null;
  carbBasis: "body_weight";
  targetKcal?: number | null;
}

/** Mesmo formato de CarbCyclingConfig do app (gravado em protocols.carb_cycling). */
export interface CarbCyclingConfig {
  enabled: boolean;
  mode: Modo;
  types: Record<TipoDia, TipoConfig>;
  assignments: Record<Weekday, TipoDia>;
  manual: Record<Weekday, boolean>;
  fixedClosingMacro: "protein" | "fat" | null;
}

export interface Meta {
  kcal: number;
  p: number;
  c: number;
  g: number;
}
export interface MetaDia extends Meta {
  type: TipoDia;
}

export const PADRAO_G_KG: Record<TipoDia, number> = { low: 1.5, medium: 2.5, high: 3.5 };

export function configPadrao(): CarbCyclingConfig {
  return {
    enabled: true,
    mode: "variable_calories",
    types: {
      low: { carbsPerKg: 1.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null },
      medium: { carbsPerKg: 2.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null },
      high: { carbsPerKg: 3.5, carbGrams: null, carbBasis: "body_weight", targetKcal: null },
    },
    assignments: {
      seg: "medium",
      ter: "medium",
      qua: "medium",
      qui: "medium",
      sex: "medium",
      sab: "low",
      dom: "low",
    },
    manual: { seg: false, ter: false, qua: false, qui: false, sex: false, sab: false, dom: false },
    fixedClosingMacro: null,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const numOu = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** "seg", "segunda", "SEGUNDA-FEIRA", "Terça (Low)" → weekday. */
export function weekdayDe(texto: unknown): Weekday | null {
  const t = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!t) return null;
  if (/^seg/.test(t)) return "seg";
  if (/^ter/.test(t)) return "ter";
  if (/^qua/.test(t)) return "qua";
  if (/^qui/.test(t)) return "qui";
  if (/^sex/.test(t)) return "sex";
  if (/^sab/.test(t)) return "sab";
  if (/^dom/.test(t)) return "dom";
  return null;
}

export function tipoDe(texto: unknown): TipoDia | null {
  const t = String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!t) return null;
  if (/^(low|baixo|baixa|l)$/.test(t) || t.startsWith("low") || t.startsWith("baix")) return "low";
  if (/^(medium|medio|media|moderado|mod|m|normal)$/.test(t) || t.startsWith("med")) return "medium";
  if (/^(high|alto|alta|h)$/.test(t) || t.startsWith("high") || t.startsWith("alt")) return "high";
  return null;
}

/** Igual a suggestCarbDayTypeForWorkout do app. */
export function sugerirTipoPeloTreino(texto: string | null | undefined): TipoDia {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return "medium";
  if (/descanso|rest|folga|off/.test(t)) return "low";
  if (/perna|lower|quadr|gl[uú]teo|posterior|full ?body|corpo inteiro/.test(t)) return "high";
  if (/cardio|caminhada|aer[oó]bic/.test(t)) return "low";
  return "medium";
}

/**
 * Dias de treino do plano ativo (ai_plans.conteudo_json.days[{day, focus}]) →
 * rótulo do treino por weekday. Dia sem treino = descanso.
 */
export function treinosDaSemana(treinoJson: unknown): Record<Weekday, string | null> {
  const saida = Object.fromEntries(WEEKDAYS.map((wd) => [wd, null])) as Record<Weekday, string | null>;
  const days = Array.isArray((treinoJson as Rec | null)?.days) ? ((treinoJson as Rec).days as Rec[]) : [];
  for (const d of days) {
    const wd = weekdayDe(d?.day);
    if (!wd || saida[wd]) continue;
    const foco = String(d?.focus ?? "").trim();
    saida[wd] = foco || String(d?.day ?? "").trim() || "treino";
  }
  return saida;
}

/** Sugestão de LOW/MEDIUM/HIGH pelos treinos (sem treino nenhum = padrão do app). */
export function sugerirDias(treinos: Record<Weekday, string | null>): Record<Weekday, TipoDia> {
  const algumTreino = WEEKDAYS.some((wd) => treinos[wd]);
  if (!algumTreino) return { ...configPadrao().assignments };
  return Object.fromEntries(
    WEEKDAYS.map((wd) => [wd, treinos[wd] ? sugerirTipoPeloTreino(treinos[wd]) : "low"]),
  ) as Record<Weekday, TipoDia>;
}

/**
 * Pedido do Jarvis → config do app.
 *   { modo?: "variavel"|"fixo", tipos?: {low?: {g_kg?, carbo_g?, kcal?}, ...},
 *     dias?: {seg: "high", ...}, fechamento?: "proteina"|"gordura", dias_altos?: [...] }
 * O que não vier usa a sugestão pelo treino e os padrões do app.
 */
export function configDoPedido(
  pedido: unknown,
  sugestao: Record<Weekday, TipoDia>,
): CarbCyclingConfig {
  const cfg = configPadrao();
  cfg.assignments = { ...sugestao };
  const p = (pedido && typeof pedido === "object" ? pedido : {}) as Rec;

  const modo = String(p.modo ?? p.mode ?? "").toLowerCase();
  if (modo.startsWith("fix")) cfg.mode = "fixed_calories";

  const tipos = (p.tipos ?? p.types ?? {}) as Rec;
  for (const tipo of TIPOS) {
    const t = (tipos[tipo] ?? {}) as Rec;
    const gkg = numOu(t.g_kg ?? t.carbsPerKg);
    const gramas = numOu(t.carbo_g ?? t.carbGrams);
    const kcal = numOu(t.kcal ?? t.targetKcal);
    if (gkg !== null) cfg.types[tipo] = { ...cfg.types[tipo], carbsPerKg: gkg, carbGrams: null };
    else if (gramas !== null) cfg.types[tipo] = { ...cfg.types[tipo], carbGrams: gramas, carbsPerKg: null };
    if (kcal !== null && kcal > 0) cfg.types[tipo].targetKcal = kcal;
  }

  // "dias altos" da entrevista: esses viram HIGH; os demais seguem a sugestão.
  const altos = Array.isArray(p.dias_altos) ? (p.dias_altos as unknown[]) : [];
  for (const a of altos) {
    const wd = weekdayDe(a);
    if (wd) {
      cfg.assignments[wd] = "high";
      cfg.manual[wd] = true;
    }
  }

  const dias = (p.dias ?? p.assignments ?? {}) as Rec;
  for (const [chave, valor] of Object.entries(dias)) {
    const wd = weekdayDe(chave);
    const tipo = tipoDe(valor);
    if (wd && tipo) {
      cfg.assignments[wd] = tipo;
      cfg.manual[wd] = true;
    }
  }

  const fech = String(p.fechamento ?? p.fixedClosingMacro ?? "").toLowerCase();
  if (cfg.mode === "fixed_calories") {
    cfg.fixedClosingMacro = fech.startsWith("prot") ? "protein" : "fat";
  }
  return cfg;
}

/** Config já salva no plano (protocols.carb_cycling) → config válida. */
export function configSalva(raw: unknown): CarbCyclingConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Rec;
  if (r.enabled !== true) return null;
  const base = configPadrao();
  const types = (r.types ?? {}) as Rec;
  for (const tipo of TIPOS) {
    const t = (types[tipo] ?? {}) as Rec;
    base.types[tipo] = {
      carbsPerKg: numOu(t.carbsPerKg),
      carbGrams: numOu(t.carbGrams),
      carbBasis: "body_weight",
      targetKcal: numOu(t.targetKcal),
    };
  }
  const asg = (r.assignments ?? {}) as Rec;
  for (const wd of WEEKDAYS) {
    const tipo = tipoDe(asg[wd]);
    if (tipo) base.assignments[wd] = tipo;
  }
  const manual = (r.manual ?? {}) as Rec;
  for (const wd of WEEKDAYS) base.manual[wd] = manual[wd] === true;
  base.mode = r.mode === "fixed_calories" ? "fixed_calories" : "variable_calories";
  base.fixedClosingMacro =
    r.fixedClosingMacro === "protein" ? "protein" : r.fixedClosingMacro === "fat" ? "fat" : null;
  return base;
}

/** Junta um pedido de mudança por cima de uma config existente. */
export function mesclarConfig(atual: CarbCyclingConfig, pedido: unknown): CarbCyclingConfig {
  const novo = configDoPedido(pedido, atual.assignments);
  const p = (pedido && typeof pedido === "object" ? pedido : {}) as Rec;
  const tiposPedido = (p.tipos ?? p.types ?? {}) as Rec;
  for (const tipo of TIPOS) {
    if (!tiposPedido[tipo]) novo.types[tipo] = { ...atual.types[tipo] };
  }
  for (const wd of WEEKDAYS) novo.manual[wd] = novo.manual[wd] || atual.manual[wd];
  if (!p.modo && !p.mode) {
    novo.mode = atual.mode;
    novo.fixedClosingMacro = atual.fixedClosingMacro;
  }
  if (novo.mode === "fixed_calories" && !novo.fixedClosingMacro) novo.fixedClosingMacro = "fat";
  return novo;
}

/** Gramas de carbo do tipo (carbGrams vence; senão g/kg × peso), como carbGramsForType. */
export function carboDoTipo(t: TipoConfig, peso: number): number | null {
  if (t.carbGrams != null && Number.isFinite(t.carbGrams)) return round1(t.carbGrams);
  if (t.carbsPerKg == null) return null;
  return round1(t.carbsPerKg * peso);
}

export type ResultadoTipo = { tipo: TipoDia; meta: Meta | null; g_kg: number | null; erro: string | null };

/** buildCarbDayTypeTargets do app. `base` = macros canônicos resolvidos da meta base. */
export function metasPorTipo(
  cfg: CarbCyclingConfig,
  peso: number,
  base: Meta,
): Record<TipoDia, ResultadoTipo> {
  const out = {} as Record<TipoDia, ResultadoTipo>;
  for (const tipo of TIPOS) {
    const t = cfg.types[tipo];
    const c = carboDoTipo(t, peso);
    const gkg = t.carbsPerKg ?? (c != null && peso > 0 ? round1(c / peso) : null);
    if (c == null) {
      out[tipo] = { tipo, meta: null, g_kg: null, erro: "Defina o carboidrato deste tipo de dia." };
      continue;
    }
    if (cfg.mode === "variable_calories") {
      const kcal = base.p * 4 + c * 4 + base.g * 9;
      out[tipo] = {
        tipo,
        g_kg: gkg,
        erro: null,
        meta: { kcal: Math.round(kcal), p: Math.round(base.p), c: Math.round(c), g: Math.round(base.g) },
      };
      continue;
    }
    const fech = cfg.fixedClosingMacro ?? "fat";
    const kcalAlvo = t.targetKcal && t.targetKcal > 0 ? t.targetKcal : base.kcal;
    let p = base.p;
    let g = base.g;
    if (fech === "fat") g = (kcalAlvo - p * 4 - c * 4) / 9;
    else p = (kcalAlvo - g * 9 - c * 4) / 4;
    if (p < 0 || g < 0) {
      out[tipo] = {
        tipo,
        g_kg: gkg,
        meta: null,
        erro: `${tipo.toUpperCase()}: o carbo de ${Math.round(c)} g não cabe em ${Math.round(kcalAlvo)} kcal (${fech === "fat" ? "gordura" : "proteína"} ficaria negativa).`,
      };
      continue;
    }
    out[tipo] = {
      tipo,
      g_kg: gkg,
      erro: null,
      meta: { kcal: Math.round(kcalAlvo), p: Math.round(p), c: Math.round(c), g: Math.round(g) },
    };
  }
  return out;
}

/** buildWeeklyCarbTargets do app. */
export function metasDaSemana(
  cfg: CarbCyclingConfig,
  porTipo: Record<TipoDia, ResultadoTipo>,
): Partial<Record<Weekday, MetaDia>> {
  const out: Partial<Record<Weekday, MetaDia>> = {};
  for (const wd of WEEKDAYS) {
    const tipo = cfg.assignments[wd];
    const meta = porTipo[tipo]?.meta;
    if (meta) out[wd] = { ...meta, type: tipo };
  }
  return out;
}

export type CicloCalculado = {
  config: CarbCyclingConfig;
  por_tipo: Record<TipoDia, ResultadoTipo>;
  semana: Partial<Record<Weekday, MetaDia>>;
  valido: boolean;
  erros: string[];
  media: Meta | null;
  aviso_media: string | null;
};

/** Tudo de uma vez + validação igual a isCarbCyclingValid e comparação com a base. */
export function calcularCiclo(cfg: CarbCyclingConfig, peso: number, base: Meta): CicloCalculado {
  const porTipo = metasPorTipo(cfg, peso, base);
  const semana = metasDaSemana(cfg, porTipo);
  const erros: string[] = [];
  for (const wd of WEEKDAYS) {
    const tipo = cfg.assignments[wd];
    if (!semana[wd]) {
      erros.push(porTipo[tipo]?.erro ?? `${NOME_DIA[wd]} (${tipo.toUpperCase()}) sem meta válida.`);
    }
  }
  const valores = WEEKDAYS.map((wd) => semana[wd]).filter(Boolean) as MetaDia[];
  const media =
    valores.length > 0
      ? {
          kcal: Math.round(valores.reduce((s, d) => s + d.kcal, 0) / valores.length),
          p: Math.round(valores.reduce((s, d) => s + d.p, 0) / valores.length),
          c: Math.round(valores.reduce((s, d) => s + d.c, 0) / valores.length),
          g: Math.round(valores.reduce((s, d) => s + d.g, 0) / valores.length),
        }
      : null;
  let aviso: string | null = null;
  if (media && valores.length === 7 && base.kcal > 0) {
    const dif = media.kcal - base.kcal;
    if (Math.abs(dif) > base.kcal * 0.1) {
      aviso = `Média semanal ${Math.abs(dif)} kcal/dia ${dif < 0 ? "abaixo" : "acima"} da meta base (${base.kcal}). Revise LOW/MEDIUM/HIGH.`;
    }
  }
  return {
    config: cfg,
    por_tipo: porTipo,
    semana,
    valido: erros.length === 0,
    erros: [...new Set(erros)],
    media,
    aviso_media: aviso,
  };
}

/** weeklyEnergySchedule no formato que a DietaIA manda para o diet-agent. */
export function scheduleDoCiclo(
  baseKcal: number,
  semana: Partial<Record<Weekday, MetaDia>>,
  treinos: Record<Weekday, string | null>,
  snapshot: Rec,
): Rec {
  return {
    base_daily_kcal: baseKcal,
    base_source: "calculated",
    calculation_snapshot: snapshot,
    days: Object.fromEntries(
      WEEKDAYS.map((wd) => {
        const d = semana[wd]!;
        return [
          wd,
          {
            base_kcal: baseKcal,
            adjustment_kcal: 0,
            fixed_kcal: d.kcal,
            target_kcal: d.kcal,
            day_type: d.type,
            protein_g: d.p || null,
            carbs_g: d.c || null,
            fat_g: d.g || null,
            workout: treinos[wd] ? { label: treinos[wd], type: "training" } : { label: "Descanso", type: "rest" },
          },
        ];
      }),
    ),
  };
}

/** weekly_day_targets gravado em protocols (igual ao app). */
export function weeklyDayTargets(semana: Partial<Record<Weekday, MetaDia>>): Rec {
  return Object.fromEntries(
    WEEKDAYS.filter((wd) => semana[wd]).map((wd) => [wd, { ...semana[wd]! }]),
  );
}

/** Bloco "METAS DIÁRIAS OBRIGATÓRIAS (CARB CYCLING)" do prompt da DietaIA. */
export function blocoPrompt(
  semana: Partial<Record<Weekday, MetaDia>>,
  ref: { tmb: number; get: number; base: number; formula: string },
): string {
  const linhas = WEEKDAYS.map((wd) => {
    const d = semana[wd];
    if (!d) return "";
    return `${NOME_DIA[wd].toUpperCase()} — ${d.type.toUpperCase()}\nKcal: ${d.kcal}\nP: ${d.p}g\nC: ${d.c}g\nG: ${d.g}g`;
  })
    .filter(Boolean)
    .join("\n\n");
  return [
    "=== REFERÊNCIA METABÓLICA (NÃO É A META DE TODOS OS DIAS) ===",
    `- TMB: ${ref.tmb} kcal (calculado por ${ref.formula})`,
    `- GET: ${ref.get} kcal`,
    `- Meta base diária (apenas referência): ${ref.base} kcal`,
    "",
    "=== METAS DIÁRIAS OBRIGATÓRIAS (CARB CYCLING) ===",
    linhas,
    "",
    "⚠️ Cada dia deve respeitar sua própria meta. Não aplicar a meta base global por cima dessas metas.",
    "⚠️ NÃO recalcule a TMB nem os macros. Os valores acima são definitivos (tolerância ±50 kcal por dia).",
  ].join("\n");
}

/** Resumo legível para o Jarvis (por tipo e por dia). */
export function resumoCiclo(c: CicloCalculado, peso: number): Rec {
  return {
    modo: c.config.mode === "fixed_calories" ? "fixo" : "variavel",
    fechamento:
      c.config.mode === "fixed_calories"
        ? c.config.fixedClosingMacro === "protein"
          ? "proteina"
          : "gordura"
        : null,
    peso,
    tipos: Object.fromEntries(
      TIPOS.map((t) => [
        t,
        {
          g_kg: c.por_tipo[t].g_kg,
          ...(c.por_tipo[t].meta ?? {}),
          erro: c.por_tipo[t].erro,
        },
      ]),
    ),
    dias: WEEKDAYS.map((wd) => ({
      dia: wd,
      nome: NOME_DIA[wd],
      tipo: c.config.assignments[wd],
      ...(c.semana[wd] ?? {}),
    })),
    media: c.media,
    aviso_media: c.aviso_media,
    valido: c.valido,
    erros: c.erros,
  };
}
