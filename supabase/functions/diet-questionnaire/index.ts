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

      // Also fetch student name
      const { data: profile } = await supabase
        .from("profiles")
        .select("nome")
        .eq("user_id", data.student_id)
        .maybeSingle();

      return new Response(JSON.stringify({ ...data, student_name: profile?.nome || "Aluno" }), {
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
        .select("id, status")
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
