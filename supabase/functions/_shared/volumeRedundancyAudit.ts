/**
 * AUDITORIA DETERMINÍSTICA DE VOLUME E REDUNDÂNCIA (pós-geração).
 *
 * Não cria taxonomia nova: reutiliza `variationFamilies` (família funcional),
 * `repRangePolicy` (função do exercício) e `workoutRedundancy` (famílias fortes).
 *
 * Responde: "a SOMA da sessão/semana é coerente com a decisão de periodização
 * e sem exercícios quase equivalentes empilhados?"
 *
 * Não altera Periodization Resolver, repRangePolicy, progression/adherence.
 */

import { variationFamilyOf, type VariationFamily } from "./variationFamilies.ts";
import { classifyExerciseFunction, type SessionProfileName } from "./repRangePolicy.ts";
import { strongFamilyKey } from "./workoutRedundancy.ts";

export type AuditStatus = "PASS" | "WARN" | "FAIL";

export type AuditReasonCode =
  | "EXCESSIVE_SAME_FAMILY"
  | "REDUNDANT_FAMILY_PAIR"
  | "EXCESSIVE_SESSION_SETS"
  | "EXCESSIVE_SESSION_EXERCISES"
  | "CALIBRATION_VOLUME_TOO_HIGH"
  | "VOLUME_ABOVE_PERIODIZATION_TARGET";

export interface AuditReason {
  code: AuditReasonCode;
  severity: "WARN" | "FAIL";
  day?: string;
  family?: string;
  exercises?: string[];
  observed?: string;
  expected?: string;
}

export type VolumeBucket = "LOW" | "MODERATE" | "MODERATE_HIGH" | "HIGH" | "VERY_HIGH";

export interface SessionVolume {
  day: string;
  profile: SessionProfileName;
  workingSets: number;
  recognitionSets: number;
  workExercises: number;
  supportExercises: number;
  familySets: Record<string, number>;
}

export interface VolumeAuditResult {
  status: AuditStatus;
  reasons: AuditReason[];
  sessions: SessionVolume[];
  weeklyFamilySets: Record<string, number>;
  weeklyFamilyBuckets: Record<string, VolumeBucket>;
  weeklyWorkingSets: number;
  weeklyBucket: VolumeBucket;
  /** Exercícios que NÃO devem ser removidos para passar no audit. */
  protectedAnchors: string[];
}

export interface VolumeAuditContext {
  sessionProfiles?: Array<{ sessionIndex: number; profile: string }>;
  /** volume_target vindo do snapshot de periodização (não é recalculado aqui). */
  volumeTarget?: string | null;
  /** "calibracao" / semana 1 de novo bloco. */
  weekStrategy?: string | null;
  weekNumber?: number | null;
  level?: string | null;
  objective?: string | null;
}

const clean = (v: unknown) => String(v ?? "").trim();
const toInt = (v: unknown): number | null => {
  const m = clean(v).match(/\d+/);
  return m ? Number(m[0]) : null;
};

/** Séries de trabalho x séries de reconhecimento (SÉRIE = 1, SÉRIE 2 = 3). */
export function countExerciseSets(ex: any): { work: number; recognition: number } {
  const scheme = ex?.set_scheme ?? ex?.setScheme;
  if (scheme?.mode === "per_set" && Array.isArray(scheme.sets) && scheme.sets.length > 0) {
    let work = 0;
    let recognition = 0;
    for (const s of scheme.sets) {
      if (String(s?.set_type ?? "work") === "recognition") recognition += 1;
      else work += 1;
    }
    return { work, recognition };
  }
  const a = toInt(ex?.series);
  const b = toInt(ex?.series2);
  if (a !== null && b !== null && b > 0) {
    // Bloco de reconhecimento + bloco de trabalho.
    return { work: b, recognition: a };
  }
  return { work: a ?? 0, recognition: 0 };
}

const familyKeyOf = (name: string): string =>
  (variationFamilyOf(name) as VariationFamily | null) ?? strongFamilyKey(name) ?? "other";

/** Mobilidade/cardio não contam como volume de hipertrofia. */
const isSupportExercise = (name: string): boolean => {
  const fn = classifyExerciseFunction(name);
  return fn === "MOBILITY" || fn === "CARDIO";
};

const BUCKET_ORDER: VolumeBucket[] = ["LOW", "MODERATE", "MODERATE_HIGH", "HIGH", "VERY_HIGH"];

export function bucketForFamilySets(sets: number): VolumeBucket {
  if (sets <= 5) return "LOW";
  if (sets <= 10) return "MODERATE";
  if (sets <= 16) return "MODERATE_HIGH";
  if (sets <= 22) return "HIGH";
  return "VERY_HIGH";
}

export function bucketForWeeklySets(sets: number): VolumeBucket {
  if (sets <= 40) return "LOW";
  if (sets <= 70) return "MODERATE";
  if (sets <= 95) return "MODERATE_HIGH";
  if (sets <= 120) return "HIGH";
  return "VERY_HIGH";
}

export function normalizeVolumeTarget(target?: string | null): VolumeBucket | null {
  const t = clean(target).toUpperCase().replace(/[\s-]+/g, "_");
  if (!t) return null;
  if (t.includes("VERY") || t === "MUITO_ALTO") return "VERY_HIGH";
  if (t.startsWith("MODERATE_HIGH") || t.startsWith("MODERADO_ALTO")) return "MODERATE_HIGH";
  if (t.startsWith("MODERATE") || t.startsWith("MODERADO")) return "MODERATE";
  if (t.startsWith("HIGH") || t.startsWith("ALTO")) return "HIGH";
  if (t.startsWith("LOW") || t.startsWith("BAIXO")) return "LOW";
  return null;
}

/** Tetos por perfil da sessão (WARN / FAIL) — não são regra universal. */
const SESSION_SET_CAPS: Record<SessionProfileName, { warn: number; fail: number }> = {
  tensao: { warn: 20, fail: 26 },
  hipertrofia: { warn: 22, fail: 28 },
  volume: { warn: 26, fail: 32 },
  deload: { warn: 14, fail: 20 },
};

const isCalibration = (ctx: VolumeAuditContext): boolean => {
  const s = clean(ctx.weekStrategy).toLowerCase();
  if (s.includes("calib")) return true;
  return ctx.weekNumber === 1;
};

export function auditVolumeRedundancy(plan: any, ctx: VolumeAuditContext = {}): VolumeAuditResult {
  const reasons: AuditReason[] = [];
  const sessions: SessionVolume[] = [];
  const weeklyFamilySets: Record<string, number> = {};
  const protectedAnchors: string[] = [];

  const profileByIndex = new Map<number, SessionProfileName>();
  for (const p of ctx.sessionProfiles ?? []) {
    const name = clean(p?.profile) as SessionProfileName;
    if (SESSION_SET_CAPS[name]) profileByIndex.set(Number(p.sessionIndex), name);
  }

  const days = Array.isArray(plan?.days) ? plan.days : [];

  days.forEach((day: any, dayIdx: number) => {
    const dayLabel = clean(day?.day) || clean(day?.label) || `Dia ${dayIdx + 1}`;
    const profile = profileByIndex.get(dayIdx) ?? "hipertrofia";
    const familySets: Record<string, number> = {};
    const familyExercises = new Map<string, string[]>();
    let workingSets = 0;
    let recognitionSets = 0;
    let workExercises = 0;
    let supportExercises = 0;

    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    exercises.forEach((ex: any, exIdx: number) => {
      const name = clean(ex?.exercise);
      if (!name) return;
      const { work, recognition } = countExerciseSets(ex);
      recognitionSets += recognition;

      if (isSupportExercise(name)) {
        supportExercises += 1;
        return;
      }

      workExercises += 1;
      workingSets += work;

      const fam = familyKeyOf(name);
      familySets[fam] = (familySets[fam] ?? 0) + work;
      weeklyFamilySets[fam] = (weeklyFamilySets[fam] ?? 0) + work;
      const list = familyExercises.get(fam) ?? [];
      list.push(name);
      familyExercises.set(fam, list);

      // Âncoras: primeiros compostos do dia nunca são o alvo da poda.
      const fn = classifyExerciseFunction(name);
      if (exIdx < 2 && (fn === "COMPOUND_PRIMARY" || fn === "COMPOUND_SECONDARY")) {
        if (!protectedAnchors.includes(name)) protectedAnchors.push(name);
      }
    });

    for (const [fam, list] of familyExercises.entries()) {
      if (fam === "other") continue;
      const distinct = [...new Set(list)];
      if (distinct.length >= 3) {
        reasons.push({
          code: "EXCESSIVE_SAME_FAMILY",
          severity: "FAIL",
          day: dayLabel,
          family: fam,
          exercises: distinct,
        });
      } else if (distinct.length === 2) {
        reasons.push({
          code: "REDUNDANT_FAMILY_PAIR",
          severity: "WARN",
          day: dayLabel,
          family: fam,
          exercises: distinct,
        });
      }
    }

    const caps = SESSION_SET_CAPS[profile];
    if (workingSets > caps.fail) {
      reasons.push({
        code: "EXCESSIVE_SESSION_SETS",
        severity: "FAIL",
        day: dayLabel,
        observed: `${workingSets} séries de trabalho`,
        expected: `≤ ${caps.warn} (perfil ${profile})`,
      });
    } else if (workingSets > caps.warn) {
      reasons.push({
        code: "EXCESSIVE_SESSION_SETS",
        severity: "WARN",
        day: dayLabel,
        observed: `${workingSets} séries de trabalho`,
        expected: `≤ ${caps.warn} (perfil ${profile})`,
      });
    }

    if (workExercises >= 10) {
      reasons.push({
        code: "EXCESSIVE_SESSION_EXERCISES",
        severity: "WARN",
        day: dayLabel,
        observed: `${workExercises} exercícios de trabalho`,
        expected: "≤ 9 (mobilidade/cardio não contam)",
      });
    }

    if (isCalibration(ctx) && workingSets > Math.round(caps.warn * 0.8)) {
      reasons.push({
        code: "CALIBRATION_VOLUME_TOO_HIGH",
        severity: workingSets > caps.warn ? "FAIL" : "WARN",
        day: dayLabel,
        observed: `${workingSets} séries de trabalho`,
        expected: `≤ ${Math.round(caps.warn * 0.8)} em semana de calibração`,
      });
    }

    sessions.push({
      day: dayLabel,
      profile,
      workingSets,
      recognitionSets,
      workExercises,
      supportExercises,
      familySets,
    });
  });

  const weeklyWorkingSets = sessions.reduce((acc, s) => acc + s.workingSets, 0);
  const weeklyBucket = bucketForWeeklySets(weeklyWorkingSets);
  const weeklyFamilyBuckets: Record<string, VolumeBucket> = {};
  for (const [fam, sets] of Object.entries(weeklyFamilySets)) {
    weeklyFamilyBuckets[fam] = bucketForFamilySets(sets);
  }

  const target = normalizeVolumeTarget(ctx.volumeTarget);
  if (target) {
    const delta = BUCKET_ORDER.indexOf(weeklyBucket) - BUCKET_ORDER.indexOf(target);
    if (delta >= 2) {
      reasons.push({
        code: "VOLUME_ABOVE_PERIODIZATION_TARGET",
        severity: "FAIL",
        observed: weeklyBucket,
        expected: target,
      });
    } else if (delta === 1) {
      reasons.push({
        code: "VOLUME_ABOVE_PERIODIZATION_TARGET",
        severity: "WARN",
        observed: weeklyBucket,
        expected: target,
      });
    }
  }

  const status: AuditStatus = reasons.some((r) => r.severity === "FAIL")
    ? "FAIL"
    : reasons.length > 0
      ? "WARN"
      : "PASS";

  return {
    status,
    reasons,
    sessions,
    weeklyFamilySets,
    weeklyFamilyBuckets,
    weeklyWorkingSets,
    weeklyBucket,
    protectedAnchors,
  };
}

/** Retry orientado: aponta o excesso concreto sem enfraquecer o validador. */
export function buildVolumeRetryInstruction(audit: VolumeAuditResult): string {
  if (audit.status === "PASS") return "";
  const lines: string[] = ["🚨 VOLUME_REDUNDANCY_VALIDATION_FAILED"];
  for (const r of audit.reasons) {
    if (r.code === "EXCESSIVE_SAME_FAMILY" || r.code === "REDUNDANT_FAMILY_PAIR") {
      lines.push(
        `${r.day}: ${r.exercises?.join(", ")} pertencem à mesma família funcional (${r.family}). Mantenha apenas UM (no máximo dois quando houver prioridade real) e ajuste as séries.`,
      );
    } else if (r.code === "VOLUME_ABOVE_PERIODIZATION_TARGET") {
      lines.push(`Volume semanal ${r.observed} contraria o alvo da periodização (${r.expected}).`);
    } else {
      lines.push(`${r.day ?? "Semana"}: ${r.observed} — esperado ${r.expected}.`);
    }
  }
  if (audit.protectedAnchors.length > 0) {
    lines.push(`NÃO remova os exercícios âncora: ${audit.protectedAnchors.join(", ")}.`);
  }
  lines.push(
    "Reduza primeiro acessórios redundantes, terceira variação da mesma família e exercícios de baixo valor marginal. Prefira menos exercícios com papéis claros a várias variações quase equivalentes. Preserve o estímulo semanal e os grupos prioritários.",
  );
  return lines.join(" ");
}
