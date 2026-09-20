// Fontes canônicas de PESO e AVALIAÇÃO do aluno (usadas pelas checagens do Jarvis).
// Puramente aditivo: não altera nenhuma tabela nem regra existente.

// deno-lint-ignore no-explicit-any
type Any = any;
type Rec = Record<string, Any>;

const MIN_KG = 20;
const MAX_KG = 400;

function sanitizeKg(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= MIN_KG || n >= MAX_KG) return null;
  return n;
}

const iso = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);

export type WeightSource = "weight_logs" | "avaliacao" | "checkin" | "reajuste";

export interface ResolvedWeight {
  peso: number | null;
  peso_fonte: WeightSource | null;
  peso_em: string | null;
}

/** Peso mais recente entre weight_logs, anthropometrics, diet_checkins e diet_readjustments. */
export async function resolveLatestWeight(
  supabase: Any,
  studentId: string,
  opts: { assessmentId?: string | null; assessmentDate?: string | null } = {},
): Promise<ResolvedWeight> {
  const candidates: Array<{ peso: number; fonte: WeightSource; em: string | null }> = [];

  const push = (peso: unknown, fonte: WeightSource, em: unknown) => {
    const kg = sanitizeKg(peso);
    if (kg != null) candidates.push({ peso: kg, fonte, em: iso(em) });
  };

  const [wl, dc, dr] = await Promise.all([
    supabase.from("weight_logs").select("peso, data").eq("student_id", studentId)
      .order("data", { ascending: false }).limit(1),
    supabase.from("diet_checkins").select("peso_kg, completed_at, created_at")
      .eq("student_id", studentId).not("peso_kg", "is", null)
      .order("completed_at", { ascending: false, nullsFirst: false }).limit(1),
    supabase.from("diet_readjustments").select("peso_atual, created_at")
      .eq("student_id", studentId).not("peso_atual", "is", null)
      .order("created_at", { ascending: false }).limit(1),
  ]);

  const wlRow = (wl.data as Rec[] | null)?.[0];
  if (wlRow) push(wlRow.peso, "weight_logs", wlRow.data);

  if (opts.assessmentId) {
    const { data: anthro } = await supabase.from("anthropometrics").select("peso")
      .eq("assessment_id", opts.assessmentId).maybeSingle();
    if (anthro?.peso != null) push(anthro.peso, "avaliacao", opts.assessmentDate);
  }

  const dcRow = (dc.data as Rec[] | null)?.[0];
  if (dcRow) push(dcRow.peso_kg, "checkin", dcRow.completed_at ?? dcRow.created_at);

  const drRow = (dr.data as Rec[] | null)?.[0];
  if (drRow) push(drRow.peso_atual, "reajuste", drRow.created_at);

  if (candidates.length === 0) return { peso: null, peso_fonte: null, peso_em: null };

  candidates.sort((a, b) => (b.em ?? "").localeCompare(a.em ?? ""));
  const best = candidates[0];
  return { peso: best.peso, peso_fonte: best.fonte, peso_em: best.em };
}

export type AssessmentSource = "manual" | "postura_ia" | "composicao_ia";

export interface ResolvedAssessment {
  data_avaliacao: string | null;
  avaliacao_fonte: AssessmentSource | null;
  avaliacao_id: string | null;
  /** id de `assessments` associado (para anthropometrics/anamnese), quando existir. */
  assessment_id: string | null;
  dias_desde_avaliacao: number | null;
  recente: boolean;
  postureScan: Rec | null;
}

/** Avaliação mais recente entre assessments, posture_scans e assessment_bodycomp_analysis. */
export async function resolveLatestAssessment(
  supabase: Any,
  studentId: string,
  now = new Date(),
): Promise<ResolvedAssessment> {
  const [assessRes, scanRes] = await Promise.all([
    supabase.from("assessments").select("id, created_at").eq("student_id", studentId)
      .order("created_at", { ascending: false }).limit(1),
    supabase.from("posture_scans").select("*").eq("student_id", studentId)
      .order("created_at", { ascending: false }).limit(1),
  ]);

  const manual = (assessRes.data as Rec[] | null)?.[0] ?? null;
  const scan = (scanRes.data as Rec[] | null)?.[0] ?? null;

  // Composição por IA: ligada por assessment_id → buscamos as avaliações do aluno.
  let bodycomp: Rec | null = null;
  const { data: assessIds } = await supabase.from("assessments").select("id, created_at")
    .eq("student_id", studentId).order("created_at", { ascending: false }).limit(20);
  const ids = ((assessIds as Rec[] | null) ?? []).map((a) => String(a.id));
  if (ids.length > 0) {
    const { data: bc } = await supabase.from("assessment_bodycomp_analysis")
      .select("id, assessment_id, created_at").in("assessment_id", ids)
      .order("created_at", { ascending: false }).limit(1);
    bodycomp = (bc as Rec[] | null)?.[0] ?? null;
  }

  const options: Array<{
    date: string; fonte: AssessmentSource; id: string; assessmentId: string | null;
  }> = [];
  if (manual?.created_at) {
    options.push({
      date: iso(manual.created_at)!, fonte: "manual",
      id: String(manual.id), assessmentId: String(manual.id),
    });
  }
  if (scan?.created_at) {
    options.push({
      date: iso(scan.created_at)!, fonte: "postura_ia",
      id: String(scan.id), assessmentId: scan.assessment_id ? String(scan.assessment_id) : null,
    });
  }
  if (bodycomp?.created_at) {
    options.push({
      date: iso(bodycomp.created_at)!, fonte: "composicao_ia",
      id: String(bodycomp.id), assessmentId: String(bodycomp.assessment_id),
    });
  }

  if (options.length === 0) {
    return {
      data_avaliacao: null, avaliacao_fonte: null, avaliacao_id: null,
      assessment_id: null, dias_desde_avaliacao: null, recente: false, postureScan: scan,
    };
  }

  options.sort((a, b) => b.date.localeCompare(a.date));
  const best = options[0];
  const dias = Math.floor(
    (now.getTime() - new Date(`${best.date}T12:00:00Z`).getTime()) / 86_400_000,
  );

  return {
    data_avaliacao: best.date,
    avaliacao_fonte: best.fonte,
    avaliacao_id: best.id,
    assessment_id: best.assessmentId ?? (manual?.id ? String(manual.id) : null),
    dias_desde_avaliacao: Number.isFinite(dias) ? dias : null,
    recente: Number.isFinite(dias) ? dias <= 90 : false,
    postureScan: scan,
  };
}

/** Desvios posturais derivados do scan de IA (attention_points_json / region_scores_json). */
export function derivePosturalDeviations(scan: Rec | null): string[] {
  if (!scan) return [];
  const texts: string[] = [];
  const attention = scan.attention_points_json;
  if (Array.isArray(attention)) {
    for (const p of attention as Rec[]) {
      texts.push(String(p?.label ?? p?.name ?? p?.title ?? p ?? "").toLowerCase());
      if (p?.description) texts.push(String(p.description).toLowerCase());
    }
  } else if (attention && typeof attention === "object") {
    texts.push(JSON.stringify(attention).toLowerCase());
  }
  const regions = scan.region_scores_json;
  if (regions && typeof regions === "object") texts.push(JSON.stringify(regions).toLowerCase());

  const blob = texts.join(" | ");
  const desvios: string[] = [];
  if (/cifose|kyphos/.test(blob)) desvios.push("hipercifose");
  if (/escolios|scolios/.test(blob)) desvios.push("escoliose");
  if (/lordose|lordos/.test(blob)) desvios.push("hiperlordose");
  if (/protrus|anteriorizad|ombro|shoulder|forward head|cabe(c|ç)a anterior/.test(blob)) {
    desvios.push("protrusao");
  }
  if (/valgo|valgus|joelho para dentro/.test(blob)) desvios.push("valgo");
  return [...new Set(desvios)];
}
