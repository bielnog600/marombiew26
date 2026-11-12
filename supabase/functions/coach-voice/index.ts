import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createCoachVoiceHandler } from './handler.ts';
import { aiFetch, withAiUsage } from '../_shared/aiUsage.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const service = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});
const BUCKET = 'coach-voice';

const handler = createCoachVoiceHandler({
  corsHeaders,
  async authenticate(req) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token === ANON_KEY) return null;
    const { data, error } = await service.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  },
  async isAdmin(userId) {
    const { data, error } = await service.rpc('has_role', { _user_id: userId, _role: 'admin' });
    return !error && data === true;
  },
  apiKey: () => Deno.env.get('ELEVENLABS_API_KEY') || null,
  // Text-to-speech calls are logged in Custos de IA (characters sent); listing voices/models is not billed.
  fetch: (url, init) => aiFetch(url, init),
  async loadConfig() {
    const { data } = await service.from('coach_voice_config')
      .select('voice_id, model_id, stability, similarity_boost, language_code').eq('id', true).maybeSingle();
    return data ?? null;
  },
  async loadPhrase(phraseKey) {
    const { data } = await service.from('coach_voice_phrases').select('phrase_key, texto').eq('phrase_key', phraseKey).maybeSingle();
    return data ?? null;
  },
  async upload(path, bytes) {
    const { error } = await service.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'audio/mpeg', cacheControl: '31536000', upsert: false,
    });
    if (error) throw new Error(`upload: ${error.message}`);
  },
  async insertTake(row) {
    const { data, error } = await service.from('coach_voice_takes').insert(row).select('*').single();
    if (error) throw new Error(`insert: ${error.message}`);
    return data;
  },
  now: () => Date.now(),
  log: (message, extra) => console.error(message, extra ?? ''),
});

Deno.serve(withAiUsage('voz_elevenlabs', 'coach-voice', handler));
