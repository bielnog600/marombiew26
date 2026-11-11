/**
 * coach-voice: gera as falas da Correção ao vivo com a voz do personal no ElevenLabs.
 * Só admin. Dependências injetadas para testar sem rede (sem imports de Deno aqui).
 * Ações: list_voices, list_models, generate { phrase_key } (uma fala = um arquivo).
 */

export const ELEVEN_BASE_URL = 'https://api.elevenlabs.io';
export const FALLBACK_MODEL_ID = 'eleven_multilingual_v2';
export const OUTPUT_FORMAT = 'mp3_44100_128';
export const DEFAULT_STABILITY = 0.4;
export const DEFAULT_SIMILARITY = 1.0;
const PHRASE_KEY = /^[a-z0-9_]{1,80}$/;

export interface CoachVoiceConfig {
  voice_id: string | null;
  model_id: string | null;
  stability: number | null;
  similarity_boost: number | null;
  language_code: string | null;
}

export interface CoachVoiceTakeRow {
  phrase_key: string;
  file_path: string;
  texto: string;
  voice_id: string;
  model_id: string;
  settings: Record<string, unknown>;
  approved: boolean;
  created_by: string;
}

export interface CoachVoiceDeps {
  corsHeaders: Record<string, string>;
  /** Id do usuário logado, ou null. */
  authenticate(req: Request): Promise<string | null>;
  isAdmin(userId: string): Promise<boolean>;
  apiKey(): string | null;
  fetch(url: string, init: RequestInit): Promise<Response>;
  loadConfig(): Promise<CoachVoiceConfig | null>;
  loadPhrase(phraseKey: string): Promise<{ phrase_key: string; texto: string } | null>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  insertTake(row: CoachVoiceTakeRow): Promise<Record<string, unknown>>;
  now(): number;
  log?(message: string, extra?: unknown): void;
}

export interface ElevenModel {
  model_id: string;
  name: string;
  can_do_text_to_speech?: boolean;
  languages?: { language_id: string; name: string }[];
}

/** Padrão: Eleven v4 se existir; senão multilingual v2; senão o primeiro que fala texto. */
export function defaultModelId(models: ElevenModel[]): string {
  const tts = models.filter((m) => m.can_do_text_to_speech !== false);
  const v4 = tts.find((m) => /(^|[_\s-])v4([_\s.-]|$)/i.test(m.model_id) || /\bv4\b/i.test(m.name));
  if (v4) return v4.model_id;
  if (tts.some((m) => m.model_id === FALLBACK_MODEL_ID)) return FALLBACK_MODEL_ID;
  return tts[0]?.model_id ?? FALLBACK_MODEL_ID;
}

/** Modelos que aceitam `language_code` (os outros recusam o campo). */
export function modelAcceptsLanguageCode(modelId: string): boolean {
  return /(turbo|flash)_v2_5|_v3|v4/i.test(modelId);
}

const clamp01 = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

/** Mensagem clara em português para a recusa do ElevenLabs. */
export function elevenLabsErrorMessage(status: number, bodyText: string): string {
  let detailStatus = '';
  let detailMessage = '';
  try {
    const parsed = JSON.parse(bodyText);
    const d = parsed?.detail ?? parsed;
    if (typeof d === 'string') detailMessage = d;
    else {
      detailStatus = String(d?.status ?? d?.code ?? '');
      detailMessage = String(d?.message ?? '');
    }
  } catch { detailMessage = bodyText.slice(0, 200); }
  const tag = `${detailStatus} ${detailMessage}`.toLowerCase();
  if (tag.includes('quota') || tag.includes('credits') || status === 402) {
    return 'Acabou a cota de caracteres do ElevenLabs. Veja o plano na sua conta do ElevenLabs e tente de novo.';
  }
  if (status === 401 || tag.includes('invalid_api_key') || tag.includes('api key')) {
    return 'O ElevenLabs recusou a chave. Confira a chave salva (ELEVENLABS_API_KEY) e se ela tem permissão de voz.';
  }
  if (tag.includes('voice_not_found') || (status === 404 && tag.includes('voice'))) {
    return 'A voz escolhida não existe mais no ElevenLabs. Escolha a voz de novo.';
  }
  if (status === 429 || tag.includes('too_many') || tag.includes('rate')) {
    return 'O ElevenLabs recusou por excesso de pedidos seguidos. Espere um pouco e tente de novo.';
  }
  return `O ElevenLabs recusou o pedido (${status})${detailMessage ? `: ${detailMessage}` : ''}.`;
}

export function createCoachVoiceHandler(deps: CoachVoiceDeps) {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...deps.corsHeaders, 'Content-Type': 'application/json' } });

  const providerError = async (res: Response) => {
    const text = await res.text().catch(() => '');
    deps.log?.('elevenlabs error', { status: res.status, body: text.slice(0, 500) });
    return json({ error: elevenLabsErrorMessage(res.status, text), provider_status: res.status, details: text.slice(0, 500) }, 502);
  };

  const eleven = (path: string, init: RequestInit, key: string) =>
    deps.fetch(`${ELEVEN_BASE_URL}${path}`, {
      ...init,
      headers: { 'xi-api-key': key, ...(init.headers as Record<string, string> | undefined) },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: deps.corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
    try {
      const userId = await deps.authenticate(req);
      if (!userId) return json({ error: 'Faça login de novo.' }, 401);
      if (!(await deps.isAdmin(userId))) return json({ error: 'Só o admin pode gerar a voz.' }, 403);

      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      const action = typeof body?.action === 'string' ? body.action : '';
      if (!['list_voices', 'list_models', 'generate'].includes(action)) return json({ error: 'Ação inválida' }, 400);

      const key = deps.apiKey();
      if (!key) return json({ error: 'A chave do ElevenLabs ainda não foi cadastrada (ELEVENLABS_API_KEY).' }, 503);

      if (action === 'list_voices') {
        const res = await eleven('/v1/voices', { method: 'GET' }, key);
        if (!res.ok) return providerError(res);
        const data = await res.json().catch(() => ({}));
        const voices = (Array.isArray(data?.voices) ? data.voices : []).map((v: any) => ({
          voice_id: String(v?.voice_id ?? ''),
          name: String(v?.name ?? ''),
          category: v?.category ?? null,
          preview_url: v?.preview_url ?? null,
        })).filter((v: { voice_id: string }) => v.voice_id);
        return json({ voices });
      }

      if (action === 'list_models') {
        const res = await eleven('/v1/models', { method: 'GET' }, key);
        if (!res.ok) return providerError(res);
        const data = await res.json().catch(() => []);
        const models: ElevenModel[] = (Array.isArray(data) ? data : [])
          .map((m: any) => ({
            model_id: String(m?.model_id ?? ''),
            name: String(m?.name ?? m?.model_id ?? ''),
            can_do_text_to_speech: m?.can_do_text_to_speech,
            languages: Array.isArray(m?.languages) ? m.languages : [],
          }))
          .filter((m: ElevenModel) => m.model_id && m.can_do_text_to_speech !== false);
        return json({ models: models.map(({ model_id, name }) => ({ model_id, name })), default_model_id: defaultModelId(models) });
      }

      // generate
      const phraseKey = typeof body?.phrase_key === 'string' ? body.phrase_key : '';
      if (!PHRASE_KEY.test(phraseKey)) return json({ error: 'Fala inválida' }, 400);
      const [config, phrase] = await Promise.all([deps.loadConfig(), deps.loadPhrase(phraseKey)]);
      if (!phrase) return json({ error: 'Fala não encontrada' }, 404);
      if (!config?.voice_id) return json({ error: 'Escolha a voz antes de gerar.' }, 400);
      const modelId = config.model_id || FALLBACK_MODEL_ID;
      const settings = {
        stability: clamp01(config.stability, DEFAULT_STABILITY),
        similarity_boost: clamp01(config.similarity_boost, DEFAULT_SIMILARITY),
      };
      const language = config.language_code || 'pt';
      const send = (withLanguage: boolean) => eleven(
        `/v1/text-to-speech/${encodeURIComponent(config.voice_id!)}?output_format=${OUTPUT_FORMAT}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: phrase.texto,
            model_id: modelId,
            voice_settings: settings,
            ...(withLanguage ? { language_code: language } : {}),
          }),
        },
        key,
      );
      let usedLanguage = modelAcceptsLanguageCode(modelId);
      let res = await send(usedLanguage);
      if (!res.ok && usedLanguage && (res.status === 400 || res.status === 422)) {
        const text = await res.clone().text().catch(() => '');
        if (/language/i.test(text)) { usedLanguage = false; res = await send(false); }
      }
      if (!res.ok) return providerError(res);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength < 100) return json({ error: 'O ElevenLabs devolveu um áudio vazio. Tente de novo.' }, 502);

      const filePath = `${phraseKey}/${deps.now()}.mp3`;
      await deps.upload(filePath, bytes);
      const take = await deps.insertTake({
        phrase_key: phraseKey,
        file_path: filePath,
        texto: phrase.texto,
        voice_id: config.voice_id,
        model_id: modelId,
        settings: { ...settings, language_code: usedLanguage ? language : null, output_format: OUTPUT_FORMAT },
        approved: false,
        created_by: userId,
      });
      return json({ take });
    } catch (error) {
      deps.log?.('coach-voice failed', String(error));
      return json({ error: 'Não foi possível concluir. Tente de novo.' }, 500);
    }
  };
}
