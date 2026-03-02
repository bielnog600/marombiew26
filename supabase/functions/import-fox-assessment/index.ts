import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractText(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

function parseNumber(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(",", ".").replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractTableValue(html: string, label: string): number | null {
  // Match patterns like <b>Label</b> ... value cm/mm/kg
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<b>${escaped}</b>[\\s\\S]*?<\\/td>[\\s]*<td>[\\s]*([\\.\\d,]+)\\s*(cm|mm|kg|%|bpm)?`,
    "i"
  );
  const match = html.match(regex);
  return match ? parseNumber(match[1]) : null;
}

function extractCardValue(html: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<b>${escaped}</b>[\\s\\S]*?font-size-30[^>]*>[\\s]*([\\.\\d,]+)`,
    "i"
  );
  const match = html.match(regex);
  return match ? parseNumber(match[1]) : null;
}

function extractCompositionValue(html: string, label: string): number | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<b>${escaped}</b>[\\s\\S]*?font-size-20[^>]*>[\\s]*([\\.\\d,]+)`,
    "i"
  );
  const match = html.match(regex);
  return match ? parseNumber(match[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, studentId } = await req.json();

    if (!url || !studentId) {
      return new Response(
        JSON.stringify({ error: "URL e studentId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the Fox report page
    const response = await fetch(url);
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Erro ao acessar URL: ${response.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();

    // Extract assessment date from HTML
    let dataAvaliacao: string | null = null;
    // Try 4-digit year first, then 2-digit year
    const dateMatch = html.match(/Data da [Aa]valia[çc][ãa]o[:\s]*([\d]{2}\/[\d]{2}\/[\d]{2,4})/i)
      || html.match(/(\d{2}\/\d{2}\/\d{2,4})/);
    if (dateMatch) {
      const parts = dateMatch[1].split("/");
      const dd = parts[0];
      const mm = parts[1];
      let yyyy = parts[2];
      // Handle 2-digit year
      if (yyyy.length === 2) {
        const num = parseInt(yyyy);
        yyyy = num > 50 ? `19${yyyy}` : `20${yyyy}`;
      }
      dataAvaliacao = `${yyyy}-${mm}-${dd}`;
    }

    // Extract data from HTML
    const peso = extractCardValue(html, "Peso");
    const altura = extractCardValue(html, "Altura");
    const imc = extractCardValue(html, "IMC");
    const gordura = extractCompositionValue(html, "Gordura");
    const gorduraIdeal = extractCompositionValue(html, "Gordura ideal");
    const pesoIdeal = extractCompositionValue(html, "Peso ideal");
    const pesoGordo = extractCompositionValue(html, "Peso gordo");
    const pesoMagro = extractCompositionValue(html, "Peso magro");

    // Skinfolds
    const subescapular = extractTableValue(html, "Subescapular");
    const triceps = extractTableValue(html, "Tríceps");
    const peitoral = extractTableValue(html, "Peitoral");
    const axilarMedia = extractTableValue(html, "Axilar média");
    const suprailiaca = extractTableValue(html, "Supra ilíaca");
    const abdominalDobra = extractTableValue(html, "Abdominal");
    const coxaDobra = extractTableValue(html, "Coxa");

    // Perimeters
    const pescoco = extractTableValue(html, "Pescoço");
    const torax = extractTableValue(html, "Peito normal");
    const cintura = extractTableValue(html, "Cintura");
    const abdomen = extractTableValue(html, "Abdômen");
    const quadril = extractTableValue(html, "Quadril");
    const ombro = extractTableValue(html, "Ombros");
    const bracoDireito = extractTableValue(html, "Braço relaxado direito");
    const bracoEsquerdo = extractTableValue(html, "Braço relaxado esquerdo");
    const bicepsContraidoDireito = extractTableValue(html, "Braço contraído direito");
    const bicepsContraidoEsquerdo = extractTableValue(html, "Braço contraído esquerdo");
    const antebracoDireito = extractTableValue(html, "Antebraço direito");
    const antebracoEsquerdo = extractTableValue(html, "Antebraço esquerdo");
    const coxaDireita = extractTableValue(html, "Coxa direita");
    const coxaEsquerda = extractTableValue(html, "Coxa esquerda");
    const panturrilhaDireita = extractTableValue(html, "Panturrilha direita");
    const panturrilhaEsquerda = extractTableValue(html, "Panturrilha esquerda");

    // RCQ
    const rcqMatch = html.match(/Nível de pontuação[\s\S]*?<b>([\d.,]+)<\/b>/i);
    const rcq = rcqMatch ? parseNumber(rcqMatch[1]) : null;

    // Detect skinfold protocol
    let metodo = "jackson_pollock_7";
    if (html.includes("3 Dobras")) metodo = "jackson_pollock_3";

    // Auth
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const insertData: Record<string, unknown> = {
      student_id: studentId,
      avaliador_id: user.id,
      notas_gerais: "Importado do Fox Avaliação Física",
    };
    if (dataAvaliacao) {
      insertData.created_at = dataAvaliacao;
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert(insertData)
      .select()
      .single();

    if (assessmentError) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar avaliação: " + assessmentError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const assessmentId = assessment.id;

    // Insert anthropometrics
    await supabase.from("anthropometrics").insert({
      assessment_id: assessmentId,
      peso,
      altura,
      imc,
      pescoco,
      torax,
      cintura,
      abdomen,
      quadril,
      ombro,
      braco_direito: bracoDireito,
      braco_esquerdo: bracoEsquerdo,
      biceps_contraido_direito: bicepsContraidoDireito,
      biceps_contraido_esquerdo: bicepsContraidoEsquerdo,
      antebraco: antebracoDireito,
      antebraco_esquerdo: antebracoEsquerdo,
      coxa_direita: coxaDireita,
      coxa_esquerda: coxaEsquerda,
      panturrilha_direita: panturrilhaDireita,
      panturrilha_esquerda: panturrilhaEsquerda,
      rcq,
    });

    // Insert skinfolds
    await supabase.from("skinfolds").insert({
      assessment_id: assessmentId,
      subescapular,
      triceps,
      peitoral,
      axilar_media: axilarMedia,
      suprailiaca,
      abdominal: abdominalDobra,
      coxa: coxaDobra,
      metodo,
    });

    // Insert composition
    await supabase.from("composition").insert({
      assessment_id: assessmentId,
      percentual_gordura: gordura,
      massa_gorda: pesoGordo,
      massa_magra: pesoMagro,
    });

    const extractedData = {
      peso, altura, imc, gordura, pesoGordo, pesoMagro, rcq,
      dobras: { subescapular, triceps, peitoral, axilarMedia, suprailiaca, abdominalDobra, coxaDobra },
      perimetros: {
        pescoco, torax, cintura, abdomen, quadril, ombro,
        bracoDireito, bracoEsquerdo, bicepsContraidoDireito, bicepsContraidoEsquerdo,
        antebracoDireito, antebracoEsquerdo, coxaDireita, coxaEsquerda,
        panturrilhaDireita, panturrilhaEsquerda,
      },
    };

    console.log("Dados extraídos:", JSON.stringify(extractedData));

    return new Response(
      JSON.stringify({
        success: true,
        assessmentId,
        data: extractedData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
