import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte canônica de peso do aluno.
 *
 * Schema real (consultado em Lovable Cloud):
 *  - weight_logs(student_id uuid, peso numeric, data date, created_at timestamptz)  ← CANÔNICA
 *  - anthropometrics(assessment_id uuid, peso numeric)  ← fallback via assessments.student_id/created_at
 *  - diet_checkins(student_id, peso_kg, completed_at)   ← já é copiado para weight_logs pelo DietCheckinDialog
 *  - NÃO existe coluna de peso em `profiles` nem em `students_profile`.
 *
 * Regra:
 *  1. weight_logs: registro mais recente por (data desc, created_at desc).
 *  2. Se não houver, anthropometrics.peso da avaliação mais recente do aluno.
 *  3. Validação: 20 < peso < 400 kg. Fora disso → null.
 */

const MIN_KG = 20;
const MAX_KG = 400;

function sanitize(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= MIN_KG || n >= MAX_KG) return null;
  return n;
}

export async function getLatestStudentWeightKg(studentId: string): Promise<number | null> {
  if (!studentId) return null;

  // 1) Fonte canônica
  const { data: log } = await supabase
    .from("weight_logs")
    .select("peso, data, created_at")
    .eq("student_id", studentId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const fromLog = sanitize(log?.peso);
  if (fromLog != null) return fromLog;

  // 2) Fallback: última avaliação antropométrica
  const { data: assess } = await supabase
    .from("assessments")
    .select("id, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assess?.id) return null;

  const { data: anthro } = await supabase
    .from("anthropometrics")
    .select("peso")
    .eq("assessment_id", assess.id)
    .maybeSingle();

  return sanitize(anthro?.peso);
}