import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MODEL = 'google/gemini-2.5-flash';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => null);
    const content = typeof body?.content === 'string' ? body.content : '';
    const targetLanguage = body?.targetLanguage === 'pt' ? 'Brazilian Portuguese' : 'English';

    if (!content.trim() || content.length > 120000) {
      return new Response(JSON.stringify({ error: 'Invalid content' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = [
      `You translate fitness and nutrition plans into ${targetLanguage}.`,
      'Rules:',
      '- Keep the markdown structure byte-for-byte: same headings, tables, columns, bullets, line breaks and ordering.',
      '- Translate ONLY human-readable text (exercise names, food names, instructions, notes, labels).',
      '- Never change numbers, units (kg, g, ml, kcal, min, s), set/rep schemes, percentages or times.',
      '- Keep proper nouns, brand names and abbreviations (RIR, RPE, TABATA, HIIT, AMRAP) as they are.',
      '- Return only the translated markdown, with no commentary and no code fences.',
    ].join('\n');

    const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-API-Key': apiKey,
        'X-Lovable-AIG-SDK': 'fetch',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'AI gateway error', status: res.status, detail }), {
        status: res.status === 429 || res.status === 402 ? res.status : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const translated = data?.choices?.[0]?.message?.content ?? '';

    return new Response(JSON.stringify({ translated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
