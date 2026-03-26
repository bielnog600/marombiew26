import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(JSON.stringify({ error: "Server config error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_user_id } = await req.json();
    if (!student_user_id) {
      return new Response(JSON.stringify({ error: "student_user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get assessment IDs for cascade delete
    const { data: assessments } = await adminClient
      .from("assessments")
      .select("id")
      .eq("student_id", student_user_id);
    const assessmentIds = (assessments ?? []).map((a) => a.id);

    // Delete assessment-related data
    if (assessmentIds.length > 0) {
      await Promise.all([
        adminClient.from("anamnese").delete().in("assessment_id", assessmentIds),
        adminClient.from("anthropometrics").delete().in("assessment_id", assessmentIds),
        adminClient.from("composition").delete().in("assessment_id", assessmentIds),
        adminClient.from("skinfolds").delete().in("assessment_id", assessmentIds),
        adminClient.from("vitals").delete().in("assessment_id", assessmentIds),
        adminClient.from("performance_tests").delete().in("assessment_id", assessmentIds),
        adminClient.from("posture").delete().in("assessment_id", assessmentIds),
        adminClient.from("assessment_photos").delete().in("assessment_id", assessmentIds),
      ]);
      await adminClient.from("assessments").delete().eq("student_id", student_user_id);
    }

    // Delete student-level data
    await Promise.all([
      adminClient.from("ai_plans").delete().eq("student_id", student_user_id),
      adminClient.from("diet_questionnaires").delete().eq("student_id", student_user_id),
      adminClient.from("goals").delete().eq("student_id", student_user_id),
      adminClient.from("progress_notes").delete().eq("student_id", student_user_id),
      adminClient.from("hr_zones").delete().eq("student_id", student_user_id),
      adminClient.from("posture_scans").delete().eq("student_id", student_user_id),
      adminClient.from("students_profile").delete().eq("user_id", student_user_id),
      adminClient.from("profiles").delete().eq("user_id", student_user_id),
      adminClient.from("user_roles").delete().eq("user_id", student_user_id),
    ]);

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(student_user_id);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
