import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildProfileUpdate,
  needsWeight,
  pickQuestionnaireAnswers,
  resolveToday,
  validatePerfil,
  weightWindowStart,
} from "../_shared/questionnaireProfile.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
async function lastWeightInWindow(supabase: any, studentId: string, today: string): Promise<string | null> {
  const { data } = await supabase
    .from("weight_logs")
    .select("data")
    .eq("student_id", studentId)
    .gte("data", weightWindowStart(today))
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const url = new URL(req.url);

    // GET: fetch questionnaire by token
    if (req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) return json({ error: "Token obrigatório" }, 400);

      const { data, error } = await supabase
        .from("diet_questionnaires")
        .select("id, student_id, status, created_at, token")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) return json({ error: "Questionário não encontrado" }, 404);

      const today = resolveToday(url.searchParams.get("hoje"), new Date());
      const [{ data: profile }, { data: foods }, { data: previousAnswers }, { data: sp }, lastWeight] = await Promise.all([
        supabase.from("profiles").select("nome, telefone").eq("user_id", data.student_id).maybeSingle(),
        supabase.from("foods").select("name").order("name"),
        // Fetch the latest completed questionnaire for pre-filling
        supabase
          .from("diet_questionnaires")
          .select("*")
          .eq("student_id", data.student_id)
          .eq("status", "completed")
          .order("responded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("students_profile")
          .select("data_nascimento, altura, raca, objetivo")
          .eq("user_id", data.student_id)
          .maybeSingle(),
        lastWeightInWindow(supabase, data.student_id, today),
      ]);

      const foodNames = [...new Set((foods || []).map((f: any) => f.name))];
      const pending = data.status === "pending";

      return json({
        ...data,
        student_name: profile?.nome || "Aluno",
        foods: foodNames,
        previous_answers: pending ? previousAnswers : null,
        perfil: pending
          ? {
            data_nascimento: sp?.data_nascimento ?? null,
            altura: sp?.altura ?? null,
            telefone: profile?.telefone ?? null,
            raca: sp?.raca ?? null,
            objetivo: sp?.objetivo ?? null,
            precisa_peso: needsWeight(lastWeight, today),
          }
          : null,
      });
    }

    // POST: submit questionnaire answers
    if (req.method === "POST") {
      const body = await req.json();
      const token = body?.token;
      if (!token) return json({ error: "Token obrigatório" }, 400);

      // Verify token exists and is pending
      const { data: existing } = await supabase
        .from("diet_questionnaires")
        .select("id, status, student_id")
        .eq("token", token)
        .maybeSingle();

      if (!existing) return json({ error: "Questionário não encontrado" }, 404);
      if (existing.status === "completed") return json({ error: "Questionário já respondido" }, 400);

      const studentId = existing.student_id as string;
      const today = resolveToday(body?.perfil?.hoje, new Date());
      const answers = pickQuestionnaireAnswers(body ?? {});

      const [{ data: sp }, { data: profile }, lastWeight] = await Promise.all([
        supabase.from("students_profile").select("id, observacoes").eq("user_id", studentId).maybeSingle(),
        supabase.from("profiles").select("nome, telefone").eq("user_id", studentId).maybeSingle(),
        lastWeightInWindow(supabase, studentId, today),
      ]);
      const pesoObrigatorio = needsWeight(lastWeight, today);

      // Validação antes de qualquer gravação.
      const checked = validatePerfil(body?.perfil, { today, pesoObrigatorio });
      if (!checked.ok) return json({ error: checked.error }, 400);

      const plan = buildProfileUpdate({
        current: { observacoes: sp?.observacoes ?? null, telefone: profile?.telefone ?? null },
        perfil: checked.value,
        answers: answers as any,
        today,
      });

      // Perfil primeiro e a ficha por último: se algo falhar o aluno pode reenviar
      // (observações não duplicam e o peso de hoje deixa de ser pedido).
      if (Object.keys(plan.studentsProfile).length > 0) {
        const res = sp
          ? await supabase.from("students_profile").update(plan.studentsProfile).eq("user_id", studentId)
          : await supabase.from("students_profile").insert({ user_id: studentId, ...plan.studentsProfile });
        if (res.error) return json({ error: "Não foi possível atualizar o seu perfil. Tente novamente." }, 500);
      }
      if (plan.telefone && profile) {
        const res = await supabase.from("profiles").update({ telefone: plan.telefone }).eq("user_id", studentId);
        if (res.error) return json({ error: "Não foi possível atualizar o seu telefone. Tente novamente." }, 500);
      }
      if (plan.weightLog) {
        const res = await supabase.from("weight_logs").insert({ student_id: studentId, ...plan.weightLog });
        if (res.error) return json({ error: "Não foi possível registar o seu peso. Tente novamente." }, 500);
      }

      const { error } = await supabase
        .from("diet_questionnaires")
        .update({
          ...answers,
          dados_perfil: {
            enviados: checked.value,
            peso_solicitado: pesoObrigatorio,
            aplicados: plan.aplicados,
            hoje: today,
          },
          status: "completed",
          responded_at: new Date().toISOString(),
        })
        .eq("token", token);

      if (error) return json({ error: error.message }, 500);

      // Notifica admins via push (best-effort)
      try {
        const studentName = profile?.nome || "Aluno";
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            send_to_admins: true,
            title: "Questionário respondido 📝",
            message: `${studentName} respondeu o questionário de dieta.`,
            data: { type: "questionnaire_completed", student_id: studentId },
          }),
        });
      } catch (e) {
        console.warn("push admin falhou:", e);
      }

      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
