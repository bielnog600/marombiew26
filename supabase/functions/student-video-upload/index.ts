import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const cfToken = Deno.env.get("CLOUDFLARE_STREAM_TOKEN");
    if (!accountId || !cfToken) {
      return new Response(
        JSON.stringify({ error: "Cloudflare credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let body: { maxDurationSeconds?: number; name?: string } = {};
    try {
      body = await req.json();
    } catch {
      // optional
    }
    // Hard-cap student videos to 30s
    const maxDurationSeconds = Math.min(
      Math.max(body.maxDurationSeconds ?? 30, 5),
      30,
    );
    const name = (body.name ?? `student-${userId}`).slice(0, 120);

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          maxDurationSeconds,
          requireSignedURLs: false,
          meta: {
            name,
            uploadedBy: userId,
            kind: "exercise_execution",
          },
        }),
      },
    );

    const cfData = await cfRes.json();
    if (!cfRes.ok || !cfData.success) {
      console.error("Cloudflare error", cfData);
      return new Response(
        JSON.stringify({
          error: "Cloudflare API error",
          details: cfData?.errors ?? cfData,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { uploadURL, uid } = cfData.result;

    return new Response(
      JSON.stringify({
        uploadURL,
        uid,
        playbackUrl: `https://iframe.videodelivery.net/${uid}`,
        thumbnailUrl:
          `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=2s&height=320`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    console.error("student-video-upload error", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});