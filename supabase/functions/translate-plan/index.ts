import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createTranslatePlanHandler, type TranslatablePlan } from './handler.ts';
import { isValidPairs, parseTranslatedTexts, translationMaxTokens, translationSystemPrompt } from './texts.ts';

// Fastest Claude model already chosen for this project (same as the food scanner).
const MODEL = 'claude-haiku-5-5';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';
const PLAN_COLUMNS = 'id, tipo, conteudo, is_draft, student_id';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

async function anthropicTranslate(texts: string[], language: string) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('missing ANTHROPIC_API_KEY');
  const res = await fetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: translationMaxTokens(texts),
      thinking: { type: 'disabled' },
      system: translationSystemPrompt(language),
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic error', res.status, await res.text());
    throw new Error(`anthropic ${res.status}`);
  }
  const data = await res.json();
  console.log('Anthropic usage', JSON.stringify(data?.usage ?? {}), 'texts', texts.length);
  const text = Array.isArray(data?.content)
    ? data.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')
    : '';
  const pairs = parseTranslatedTexts(text, texts);
  if (!pairs) {
    console.error('translate-plan misaligned answer', { stop_reason: data?.stop_reason, expected: texts.length });
    throw new Error('misaligned translation');
  }
  return pairs;
}

const handler = createTranslatePlanHandler({
  corsHeaders,
  async authenticate(req) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token === ANON_KEY) return null;
    const { data, error } = await service.auth.getUser(token);
    return error || !data?.user ? null : token;
  },
  async loadPlanForUser(token, planId) {
    // Caller's own permissions: a student only reaches their own plans.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data } = await asUser.from('ai_plans').select(PLAN_COLUMNS).eq('id', planId).maybeSingle();
    return (data as TranslatablePlan | null) ?? null;
  },
  async loadPlan(planId) {
    const { data } = await service.from('ai_plans').select(PLAN_COLUMNS).eq('id', planId).maybeSingle();
    return (data as TranslatablePlan | null) ?? null;
  },
  async studentLanguage(studentId) {
    const { data } = await service.from('students_profile').select('app_language').eq('user_id', studentId).maybeSingle();
    return (data as { app_language?: string | null } | null)?.app_language ?? null;
  },
  async findCached(contentHash, language) {
    const { data } = await service
      .from('plan_translations')
      .select('translated')
      .eq('content_hash', contentHash)
      .eq('language', language)
      .maybeSingle();
    const translated = (data as { translated?: unknown } | null)?.translated;
    return isValidPairs(translated) ? translated : null;
  },
  async saveCached(row) {
    const { error } = await service.from('plan_translations').upsert(row, { onConflict: 'content_hash,language', ignoreDuplicates: true });
    if (error) throw error;
  },
  translate: anthropicTranslate,
  async sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  },
  waitUntil(promise) {
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(promise);
  },
  log: (message, extra) => console.error(message, extra ?? ''),
});

Deno.serve(handler);
