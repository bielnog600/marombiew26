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
 *  1. Compara a data do último weight_logs com a data da última avaliação
 *     (assessments.created_at) e usa o registro MAIS RECENTE dos dois.
 *  2. Empate → prevalece o weight_logs (pesagem manual do dia).
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

  const [logRes, assessRes] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("peso, data, created_at")
      .eq("student_id", studentId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("assessments")
      .select("id, created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const logWeight = sanitize(logRes.data?.peso);
  const logDate = logRes.data?.data ? String(logRes.data.data).slice(0, 10) : null;

  let assessWeight: number | null = null;
  let assessDate: string | null = null;
  if (assessRes.data?.id) {
    const { data: anthro } = await supabase
      .from("anthropometrics")
      .select("peso")
      .eq("assessment_id", assessRes.data.id)
      .maybeSingle();
    assessWeight = sanitize(anthro?.peso);
    assessDate = assessRes.data.created_at ? String(assessRes.data.created_at).slice(0, 10) : null;
  }

  if (logWeight == null) return assessWeight;
  if (assessWeight == null) return logWeight;

  // Ambos existem → o mais recente vence (empate: weight_logs)
  if (logDate && assessDate && assessDate > logDate) return assessWeight;
  if (!logDate && assessDate) return assessWeight;
  return logWeight;
}