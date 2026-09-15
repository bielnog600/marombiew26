/**
 * FASE 6 — serializer canônico COMPARTILHADO (app + Edge Functions).
 *
 * Arquivo puro e autocontido: o markdown publicado é sempre derivado do JSON
 * canônico (snapshotado, na publicação), nunca de um markdown anterior.
 */

export interface CanonicalMarkdownMacros {
  kcal?: number | null;
  p?: number | null;
  c?: number | null;
  g?: number | null;
}

export interface CanonicalMarkdownItem {
  name?: string | null;
  qtyGrams?: number | null;
  portionLabel?: string | null;
  macros?: CanonicalMarkdownMacros | null;
}

export interface CanonicalMarkdownMeal {
  name?: string | null;
  time?: string | null;
  items?: CanonicalMarkdownItem[] | null;
}

export interface CanonicalMarkdownDay {
  label?: string | null;
  weekday?: string | null;
  meals?: CanonicalMarkdownMeal[] | null;
}

export interface CanonicalMarkdownPlan {
  meta?: Record<string, any> | null;
  targets?: CanonicalMarkdownMacros | null;
  days?: CanonicalMarkdownDay[] | null;
  tips?: string[] | null;
  whatsappMessages?: string[] | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v: number): string => {
  if (!Number.isFinite(v) || v <= 0) return "0";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const cell = (v: number): string => (num(v) ? String(Math.round(num(v) * 10) / 10) : "-");

/** Tabela única de refeições de UM dia (formato entendido pelo parser legado). */
export const buildCanonicalMealTable = (meals: CanonicalMarkdownMeal[]): string => {
  const rows: string[] = [
    "| Refeição | Horário | Alimento | Quantidade | Kcal | P | C | G |",
    "|----------|---------|----------|------------|------|---|---|---|",
  ];
  let dayKcal = 0, dayP = 0, dayC = 0, dayG = 0;

  for (const meal of meals ?? []) {
    let mealKcal = 0, mealP = 0, mealC = 0, mealG = 0;
    const items = meal?.items ?? [];
    items.forEach((item, idx) => {
      const mealCell = idx === 0 ? String(meal?.name ?? "-") : "-";
      const timeCell = idx === 0 ? String(meal?.time || "-") : "-";
      const qty = num(item?.qtyGrams);
      const m = item?.macros ?? {};
      rows.push(
        `| ${mealCell} | ${timeCell} | ${String(item?.name ?? "-")} | ${
          qty > 0 ? `${Math.round(qty * 10) / 10} g` : (item?.portionLabel || "-")
        } | ${cell(num(m.kcal))} | ${cell(num(m.p))} | ${cell(num(m.c))} | ${cell(num(m.g))} |`,
      );
      mealKcal += num(m.kcal);
      mealP += num(m.p);
      mealC += num(m.c);
      mealG += num(m.g);
    });
    rows.push(
      `| **Total ${String(meal?.name ?? "")}** | - | - | - | ${fmt(mealKcal)} | ${fmt(mealP)} | ${fmt(mealC)} | ${fmt(mealG)} |`,
    );
    dayKcal += mealKcal; dayP += mealP; dayC += mealC; dayG += mealG;
  }

  rows.push(`| **TOTAL DIA** | - | - | - | ${fmt(dayKcal)} | ${fmt(dayP)} | ${fmt(dayC)} | ${fmt(dayG)} |`);
  return rows.join("\n");
};

/**
 * FASE 6 (item 58): plano com mais de um dia NUNCA é "cardápio único".
 */
export const canonicalDietPlanToMarkdown = (plan: CanonicalMarkdownPlan): string => {
  const days = Array.isArray(plan?.days) ? plan!.days! : [];
  const meta = plan?.meta ?? {};
  const t = plan?.targets ?? {};

  const headerParts: string[] = [];
  if (meta.objective) headerParts.push(`Objetivo: **${meta.objective}**`);
  if (meta.strategy) headerParts.push(`Estratégia: **${meta.strategy}**`);
  if (meta.style) headerParts.push(`Estilo: **${meta.style}**`);

  const lines: string[] = [];
  lines.push(days.length > 1 ? "## PLANO ALIMENTAR POR DIA" : "## CARDÁPIO BASE");
  if (headerParts.length) lines.push(headerParts.join(" · "));
  lines.push("");
  lines.push(
    `**Meta diária:** ${Math.round(num(t.kcal))} kcal · ${Math.round(num(t.p))}g P · ${Math.round(num(t.c))}g C · ${Math.round(num(t.g))}g G`,
  );
  lines.push("");

  days.forEach((day, i) => {
    if (days.length > 1) lines.push(`### ${String(day?.label || day?.weekday || `Dia ${i + 1}`)}`);
    lines.push(buildCanonicalMealTable(day?.meals ?? []));
    lines.push("");
  });

  if (plan?.tips?.length) {
    lines.push("## Dicas e timing nutricional");
    for (const tip of plan.tips) lines.push(`- ${tip}`);
    lines.push("");
  }

  if (plan?.whatsappMessages?.length) {
    lines.push("## Mensagens WhatsApp");
    plan.whatsappMessages.forEach((m, idx) => {
      lines.push(`**Parte ${idx + 1}:**`);
      lines.push(m);
      lines.push("");
    });
  }

  if (meta.rationale || meta.decision) {
    lines.push("## Justificativa Técnica");
    if (meta.decision) lines.push(`- **Decisão:** ${meta.decision}`);
    if (meta.rationale) lines.push(meta.rationale);
    if (typeof meta.confidence === "number") lines.push(`- **Nível de confiança:** ${meta.confidence}/100`);
  }

  return lines.join("\n").trimEnd() + "\n";
};
