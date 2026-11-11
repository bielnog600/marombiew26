import { describe, expect, it, vi } from 'vitest';
import {
  createCoachVoiceHandler, defaultModelId, elevenLabsErrorMessage, type CoachVoiceDeps,
} from '../../supabase/functions/coach-voice/handler';

function setup(opts: { user?: string | null; admin?: boolean; providerStatus?: number; providerBody?: string } = {}) {
  const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
    if (opts.providerStatus) return new Response(opts.providerBody ?? '{}', { status: opts.providerStatus });
    if (url.includes('/v1/voices')) return Response.json({ voices: [{ voice_id: 'v1', name: 'Fabiew', category: 'cloned' }] });
    if (url.includes('/v1/models')) return Response.json([
      { model_id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', can_do_text_to_speech: true },
      { model_id: 'eleven_v4', name: 'Eleven v4', can_do_text_to_speech: true },
    ]);
    return new Response(new Uint8Array(2000), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  });
  const deps: CoachVoiceDeps = {
    corsHeaders: { 'Access-Control-Allow-Origin': '*' },
    authenticate: vi.fn(async () => (opts.user === undefined ? 'admin-1' : opts.user)),
    isAdmin: vi.fn(async () => opts.admin ?? true),
    apiKey: () => 'key',
    fetch: fetchMock,
    loadConfig: vi.fn(async () => ({ voice_id: 'v1', model_id: 'eleven_multilingual_v2', stability: 0.4, similarity_boost: 1, language_code: 'pt' })),
    loadPhrase: vi.fn(async (k: string) => ({ phrase_key: k, texto: 'Desce mais!' })),
    upload: vi.fn(async () => undefined),
    insertTake: vi.fn(async (row) => ({ id: 't1', ...row })),
    now: () => 1700000000000,
  };
  return { handler: createCoachVoiceHandler(deps), deps, fetchMock };
}

const post = (body: unknown) => new Request('http://x/coach-voice', {
  method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body),
});

describe('coach-voice — só admin', () => {
  it('sem login: 401 e não chama o ElevenLabs', async () => {
    const { handler, fetchMock } = setup({ user: null });
    const res = await handler(post({ action: 'list_voices' }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aluno (não admin): 403 e não gera nada', async () => {
    const { handler, fetchMock, deps } = setup({ user: 'aluno-1', admin: false });
    const res = await handler(post({ action: 'generate', phrase_key: 'desce_mais' }));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.insertTake).not.toHaveBeenCalled();
  });
});

describe('coach-voice — gerar uma fala', () => {
  it('uma chamada, MP3 salvo em {chave}/{data}.mp3 e versão não aprovada', async () => {
    const { handler, fetchMock, deps } = setup();
    const res = await handler(post({ action: 'generate', phrase_key: 'desce_mais' }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v1?output_format=mp3_44100_128');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ text: 'Desce mais!', model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.4, similarity_boost: 1 } });
    expect(deps.upload).toHaveBeenCalledWith('desce_mais/1700000000000.mp3', expect.any(Uint8Array));
    expect(deps.insertTake).toHaveBeenCalledWith(expect.objectContaining({ phrase_key: 'desce_mais', file_path: 'desce_mais/1700000000000.mp3', approved: false }));
  });

  it('cota esgotada: erro claro e nada salvo', async () => {
    const { handler, deps } = setup({ providerStatus: 401, providerBody: JSON.stringify({ detail: { status: 'quota_exceeded', message: 'You exceeded your quota' } }) });
    const res = await handler(post({ action: 'generate', phrase_key: 'desce_mais' }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/cota/);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('chave inválida e modelo padrão', async () => {
    expect(elevenLabsErrorMessage(401, JSON.stringify({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }))).toMatch(/chave/);
    expect(defaultModelId([{ model_id: 'eleven_multilingual_v2', name: 'v2' }, { model_id: 'eleven_v4', name: 'Eleven v4' }])).toBe('eleven_v4');
    expect(defaultModelId([{ model_id: 'eleven_turbo_v2_5', name: 'Turbo' }, { model_id: 'eleven_multilingual_v2', name: 'Multi' }])).toBe('eleven_multilingual_v2');
  });
});
