import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      if (!token) {
        return new Response(JSON.stringify({ error: "Token obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("diet_questionnaires")
        .select("id, student_id, status, created_at, token")
        .eq("token", token)
        .maybeSingle();

      if (error || !data) {
        return new Response(JSON.stringify({ error: "Questionário não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also fetch student name, foods list, and previous answers
      const [{ data: profile }, { data: foods }, { data: previousAnswers }] = await Promise.all([
        supabase.from("profiles").select("nome").eq("user_id", data.student_id).maybeSingle(),
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
      ]);

      const foodNames = [...new Set((foods || []).map((f: any) => f.name))];

      return new Response(JSON.stringify({
        ...data,
        student_name: profile?.nome || "Aluno",
        foods: foodNames,
        previous_answers: data.status === 'pending' ? previousAnswers : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: submit questionnaire answers
    if (req.method === "POST") {
      const body = await req.json();
      const { token, ...answers } = body;

      if (!token) {
        return new Response(JSON.stringify({ error: "Token obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify token exists and is pending
      const { data: existing } = await supabase
        .from("diet_questionnaires")
        .select("id, status, student_id")
        .eq("token", token)
        .maybeSingle();

      if (!existing) {
        return new Response(JSON.stringify({ error: "Questionário não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (existing.status === "completed") {
        return new Response(JSON.stringify({ error: "Questionário já respondido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("diet_questionnaires")
        .update({
          ...answers,
          status: "completed",
          responded_at: new Date().toISOString(),
        })
        .eq("token", token);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Notifica admins via push (best-effort)
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nome")
          .eq("user_id", existing.student_id)
          .maybeSingle();
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
            data: { type: "questionnaire_completed", student_id: existing.student_id },
          }),
        });
      } catch (e) {
        console.warn("push admin falhou:", e);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
