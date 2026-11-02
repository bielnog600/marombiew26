/**
 * Escritório de IA — Agente de Dieta: valores atuais sugeridos, checagens pós-
 * geração (as mesmas que a tela mostra) e resumos legíveis. Puro (sem cliente).
 */
import type { WizardField } from './fields';
import { fillDefaults, type Suggestion } from './officeSummaries';
import {
  ACTIVITY_LEVELS, STRATEGIES, DIET_STYLES, PHASES, MEAL_COUNTS, RESTRICTION_OPTIONS, PREFERENCE_OPTIONS,
  parsePositiveNumber, type StudentCtx,
} from './dietaWizard';
import {
  DIET_STRATEGY_ADJUSTMENT_IDS, DIET_STRUCTURE_ADJUSTMENT_IDS, DIET_FINE_TUNE_ADJUSTMENT_IDS,
} from './dietaFields';
import type { DietaPrefill } from './dietaStudentData';
import { ENERGY_WEEKDAYS, WEEKDAY_LABELS } from '../weeklyEnergy';
import { validateCanonicalDietTarget, validateCanonicalDietDayTargets } from '../canonicalDietValidation';
import { computeViabilityScore } from '../dietViability';
import { detectNewFoodsFromPlan } from '../newFoodsDetector';
import type { DietPlan } from '../dietSchema';

const has = (arr: ReadonlyArray<{ value: string }>, v: unknown) => typeof v === 'string' && arr.some((o) => o.value === v);
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/**
 * valor_atual por campo. Prioridade: dieta vigente (publicada) → questionário
 * de dieta → recomendação que a própria tela faz pela avaliação/perfil.
 */
export function suggestDietaValues(
  fields: WizardField[],
  input: { prefill: DietaPrefill; latestQuestionnaire: any | null; currentDiet: any | null; ctx: StudentCtx | null },
): Record<string, Suggestion> {
  const { prefill, latestQuestionnaire, currentDiet, ctx } = input;
  const out: Record<string, Suggestion> = {};
  const set = (id: string, v: unknown, origem: string) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
    if (!out[id]) out[id] = { valor_atual: v, origem_valor: origem };
  };

  // 1) Dieta vigente
  if (currentDiet) {
    const src = `dieta atual (${fmtDate(currentDiet.published_at ?? currentDiet.created_at)})`;
    const plan = currentDiet.conteudo_json ?? null;
    const p = currentDiet.protocols ?? {};
    const wes = p.weekly_energy_schedule ?? null;
    const snap = wes?.calculation_snapshot ?? null;
    const lvl = ACTIVITY_LEVELS.find((a) => snap?.activity_factor != null && Math.abs(a.factor - Number(snap.activity_factor)) < 1e-6);
    if (lvl) set('nivel_atividade', lvl.value, src);
    if (has(STRATEGIES, currentDiet.diet_strategy)) set('estrategia', currentDiet.diet_strategy, src);
    else if (snap?.strategy_percent != null) {
      const st = STRATEGIES.find((s) => s.pct === Number(snap.strategy_percent));
      if (st) set('estrategia', st.value, `${src} — pela % da estratégia`);
    }
    if (has(PHASES, plan?.meta?.phase)) set('fase', plan.meta.phase, src);
    if (has(DIET_STYLES, plan?.meta?.style)) set('estilo_dieta', plan.meta.style, src);
    const meals = Array.isArray(plan?.days?.[0]?.meals) ? plan.days[0].meals.length : null;
    if (meals && has(MEAL_COUNTS, String(meals))) set('num_refeicoes', String(meals), src);
    const adj: string[] = Array.isArray(p.adjustments) ? p.adjustments : [];
    set('conducao', adj.filter((a) => (DIET_STRATEGY_ADJUSTMENT_IDS as readonly string[]).includes(a)), src);
    set('reorganizacao_refeicoes', adj.filter((a) => (DIET_STRUCTURE_ADJUSTMENT_IDS as readonly string[]).includes(a)), src);
    set('ajustes_finos', adj.filter((a) => (DIET_FINE_TUNE_ADJUSTMENT_IDS as readonly string[]).includes(a)), src);
    if (p.extras) {
      if (p.extras.fitoterapia) set('fitoterapia', true, src);
      if (p.extras.suplementos) set('suplementacao', true, src);
      if (p.extras.emagrecimento_rapido) set('hiit_termogenicos', true, src);
      if (p.extras.jejum_intermitente) set('jejum_intermitente', true, src);
    }
    if (wes?.base_source === 'manual' && typeof wes.base_daily_kcal === 'number') {
      set('meta_base_modo', 'manual', src);
      set('meta_base_manual_kcal', wes.base_daily_kcal, src);
    } else if (wes?.base_source === 'automatic') {
      set('meta_base_modo', 'automatic', src);
    }
    if (wes?.days && !p.carb_cycling?.enabled) {
      const perDay: Record<string, number> = {};
      for (const wd of ENERGY_WEEKDAYS) {
        const a = Number(wes.days?.[wd]?.adjustment_kcal) || 0;
        if (a !== 0) perDay[wd] = Math.round(a);
      }
      if (Object.keys(perDay).length) set('ajuste_kcal_por_dia', perDay, src);
    }
    const peso = parsePositiveNumber(ctx?.peso);
    const t = plan?.targets;
    if (peso && t) {
      const pk = Math.round((Number(t.p) / peso) * 10) / 10;
      const gk = Math.round((Number(t.g) / peso) * 10) / 10;
      if (pk >= 0.8 && pk <= 3.5) set('proteina_g_kg', pk, `${src} — P ${Math.round(Number(t.p))} g ÷ ${peso} kg`);
      if (gk >= 0.3 && gk <= 2) set('gordura_g_kg', gk, `${src} — G ${Math.round(Number(t.g))} g ÷ ${peso} kg`);
    }
  }

  // 2) Questionário / perfil / avaliação (mesmo pré-preenchimento da tela)
  const qsrc = latestQuestionnaire ? `questionário de dieta (${fmtDate(latestQuestionnaire.responded_at ?? latestQuestionnaire.created_at)})` : 'perfil do aluno';
  const recSrc = 'recomendação do wizard (avaliação/objetivo/questionário)';
  set('num_refeicoes', prefill.mealCount, qsrc);
  set('horario_treino', prefill.trainingTime, qsrc);
  set('dias_treino', prefill.trainingDays, qsrc);
  if (prefill.usesHormones !== undefined) set('usa_hormonios', prefill.usesHormones, qsrc);
  set('detalhes_hormonios', prefill.hormoneDetails, qsrc);
  set('estrategia', prefill.strategy, recSrc);
  set('fase', prefill.phase, recSrc);
  set('estilo_dieta', prefill.dietStyle, recSrc);
  // Texto livre da ficha: se bater exatamente com as opções vira seleção, senão fica em "outras".
  const split = (txt: string | undefined, opts: string[]) => {
    if (!txt) return { sel: [] as string[], rest: '' };
    const parts = txt.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    const sel = parts.filter((x) => opts.includes(x));
    return { sel, rest: parts.filter((x) => !opts.includes(x)).join(', ') };
  };
  const r = split(prefill.customRestriction, RESTRICTION_OPTIONS);
  set('restricoes', r.sel, qsrc);
  set('restricoes_outras', r.rest, qsrc);
  const pf = split(prefill.customPreference, PREFERENCE_OPTIONS);
  set('preferencias', pf.sel, qsrc);
  set('preferencias_outras', pf.rest, qsrc);
  if (ctx?.anamnese?.rotina) set('rotina_diaria', String(ctx.anamnese.rotina), 'anamnese (rotina)');

  return fillDefaults(fields, out);
}

const r0 = (n: unknown) => Math.round(Number(n) || 0);

/** Resumo curto da dieta vigente (publicada). */
export function resumoDietaAtual(currentDiet: any | null): string {
  if (!currentDiet) return 'Aluno sem dieta publicada.';
  const plan = currentDiet.conteudo_json;
  const t = plan?.targets;
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const meals = days[0]?.meals?.length ?? null;
  const cc = currentDiet.protocols?.carb_cycling?.enabled ? 'carb cycling' : 'linear';
  return [
    `${currentDiet.titulo ?? 'Dieta'} — publicada em ${fmtDate(currentDiet.published_at ?? currentDiet.created_at)}`,
    t ? `Meta: ${r0(t.kcal)} kcal · P ${r0(t.p)} g · C ${r0(t.c)} g · G ${r0(t.g)} g` : null,
    `${meals ?? '?'} refeições/dia · ${days.length || '?'} dia(s) no plano · ${cc}`,
  ].filter(Boolean).join('\n');
}

export interface DietAssessment {
  validation: { valid: boolean; reasons: string[] };
  viability: { score: number; breakdown: unknown; notes: string[] } | null;
  newFoods: string[];
  unresolved: string[];
}

/** As mesmas checagens que a tela roda depois de gerar (validação, viabilidade, alimentos novos). */
export function assessGeneratedDiet(p: {
  plan: DietPlan;
  foods: Array<{ id: string; name: string; calories: number; protein: number; carbs: number; fats: number; portion_size: number }>;
  carbCyclingEnabled: boolean;
  target: { calories: number; protein: number; carbs: number; fats: number };
  weeklyCarbTargets: any;
  questionnaire: any;
  adherencePct: number | null;
  mealCount: number;
}): DietAssessment {
  let validation: { valid: boolean; reasons: string[] };
  if (p.carbCyclingEnabled) {
    const rep = validateCanonicalDietDayTargets({ plan: p.plan, dayTargets: p.weeklyCarbTargets, foods: p.foods });
    const reasons: string[] = [];
    for (const [wd, d] of Object.entries(rep.days ?? {})) {
      if (d && !(d as any).valid) reasons.push(`${(WEEKDAY_LABELS as any)[wd] ?? wd}: ${((d as any).reasons ?? []).join(' ')}`.trim());
    }
    for (const wd of rep.missingDays ?? []) reasons.push(`${(WEEKDAY_LABELS as any)[wd] ?? wd}: dia ausente no plano`);
    validation = { valid: rep.valid, reasons };
  } else {
    const rep = validateCanonicalDietTarget({ plan: p.plan, target: p.target, foods: p.foods });
    validation = { valid: rep.valid, reasons: rep.reasons };
  }
  let viability: DietAssessment['viability'] = null;
  try {
    viability = computeViabilityScore({ plan: p.plan, questionnaire: p.questionnaire ?? null, adherencePct: p.adherencePct, mealCount: p.mealCount || undefined });
  } catch { /* igual à tela: viabilidade é opcional */ }
  let newFoods: string[] = [];
  try {
    newFoods = detectNewFoodsFromPlan(p.plan, p.foods.map((f) => f.name)).map((f: any) => f.name ?? f.normalized ?? String(f));
  } catch { /* opcional */ }
  const unresolved: string[] = [];
  for (const d of p.plan.days ?? []) for (const m of d.meals ?? []) for (const it of m.items ?? []) {
    if (it?.resolutionStatus === 'unresolved') unresolved.push(`${d.label} · ${m.name}: ${it.name}`);
  }
  return { validation, viability, newFoods, unresolved };
}

/** Resumo legível do rascunho gerado (cardápio + meta + checagens). */
export function resumoDietaCompleto(plan: DietPlan, a: DietAssessment, warnings: string[] = []): string {
  const lines: string[] = [];
  const t = plan.targets;
  lines.push(`**Meta:** ${r0(t.kcal)} kcal · P ${r0(t.p)} g · C ${r0(t.c)} g · G ${r0(t.g)} g`);
  lines.push(a.validation.valid ? 'Validação: dentro da meta (±50 kcal / P ±10 / C ±15 / G ±8).' : `Validação: FORA da meta — ${a.validation.reasons.join(' ')}`);
  if (a.unresolved.length) lines.push(`Alimentos sem vínculo com a base (bloqueiam a publicação): ${a.unresolved.join('; ')}`);
  if (a.newFoods.length) lines.push(`Alimentos novos detectados: ${a.newFoods.join(', ')}`);
  if (a.viability) lines.push(`Viabilidade: ${a.viability.score}/100`);
  for (const w of warnings) lines.push(`Aviso: ${w}`);
  const days = plan.days ?? [];
  const showDays = days.length > 1 ? days : days.slice(0, 1);
  const c = (v: unknown) => (v == null || String(v).trim() === '' ? '—' : String(v).replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim());
  for (const d of showDays) {
    lines.push('');
    lines.push(`### ${days.length > 1 ? `${c(d.label)} — ` : ''}${r0(d.totals?.kcal)} kcal · P ${r0(d.totals?.p)} · C ${r0(d.totals?.c)} · G ${r0(d.totals?.g)}`);
    lines.push('');
    lines.push('| Refeição | Horário | Alimento | Quantidade | kcal | P | C | G |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const m of d.meals ?? []) {
      for (const it of m.items ?? []) {
        const qtd = it.qtyGrams ? `${r0(it.qtyGrams)} g${it.portionLabel ? ` (${it.portionLabel})` : ''}` : it.portionLabel;
        lines.push(`| ${c(m.name)} | ${c(m.time)} | ${c(it.name)} | ${c(qtd)} | ${r0(it.macros?.kcal)} | ${r0(it.macros?.p)} | ${r0(it.macros?.c)} | ${r0(it.macros?.g)} |`);
      }
      lines.push(`| **${c(m.name)} — total** |  |  |  | **${r0(m.totals?.kcal)}** | **${r0(m.totals?.p)}** | **${r0(m.totals?.c)}** | **${r0(m.totals?.g)}** |`);
    }
  }
  return lines.join('\n');
}
