import { describe, expect, it, vi } from 'vitest';
import { createTranslatePlanHandler, type TranslatablePlan, type TranslatePlanDeps } from '../../supabase/functions/translate-plan/handler';
import {
  cacheKeyInput,
  extractPlanTexts,
  parseTranslatedTexts,
  type TranslationPair,
} from '../../supabase/functions/translate-plan/texts';

const PLAN_ID = '22222222-2222-4222-8222-222222222222';
const STUDENT = 'aluno-en';
const DIET_MD = [
  '## Plano alimentar',
  'Texto longo de explicação que o aluno não vê nesta tela e não deve ir para a IA.',
  '| Refeição | Horário | Alimento | Quantidade | Kcal |',
  '|---|---|---|---|---|',
  '| Café da manhã | 07:00 | Pão francês | 50 g | 140 |',
  '| Almoço | 12:00 | Arroz branco | 150 g | 190 |',
  '| Almoço | 12:00 | **Arroz branco** | 150 g | 190 |',
].join('\n');

const diet = (over: Partial<TranslatablePlan> = {}): TranslatablePlan => ({
  id: PLAN_ID, tipo: 'dieta', conteudo: DIET_MD, is_draft: false, student_id: STUDENT, ...over,
});

const fakeHash = async (text: string) => `h${text.length}:${text.slice(-12)}`;

function setup(opts: { plan?: TranslatablePlan | null; language?: string | null; cache?: Map<string, TranslationPair[]> } = {}) {
  const cache = opts.cache ?? new Map<string, TranslationPair[]>();
  const background: Promise<unknown>[] = [];
  const deps: TranslatePlanDeps = {
    corsHeaders: { 'Access-Control-Allow-Origin': '*' },
    authenticate: vi.fn(async (req: Request) => (req.headers.get('Authorization') ? 'token' : null)),
    loadPlanForUser: vi.fn(async () => (opts.plan === undefined ? diet() : opts.plan)),
    loadPlan: vi.fn(async () => (opts.plan === undefined ? diet() : opts.plan)),
    studentLanguage: vi.fn(async () => (opts.language === undefined ? 'en' : opts.language)),
    findCached: vi.fn(async (hash: string, lang: string) => cache.get(`${lang}:${hash}`) ?? null),
    saveCached: vi.fn(async (row) => { cache.set(`${row.language}:${row.content_hash}`, row.translated); }),
    translate: vi.fn(async (texts: string[]) => texts.map((t) => [t, `EN ${t}`] as TranslationPair)),
    sha256: fakeHash,
    waitUntil: vi.fn((p: Promise<unknown>) => { background.push(p); }),
  };
  const handler = createTranslatePlanHandler(deps);
  const call = (body: unknown, auth = true) => handler(new Request('http://x/translate-plan', {
    method: 'POST',
    headers: auth ? { Authorization: 'Bearer user' } : {},
    body: JSON.stringify(body),
  }));
  return { deps, call, cache, background };
}

describe('translate-plan — só o texto exibido vai para a IA', () => {
  it('dieta: células com texto, sem números, sem repetidos e sem a explicação longa', () => {
    expect(extractPlanTexts('dieta', DIET_MD)).toEqual([
      'Refeição', 'Horário', 'Alimento', 'Quantidade', 'Kcal', 'Café da manhã', 'Pão francês', 'Almoço', 'Arroz branco',
    ]);
  });

  it('treino: só os rótulos dos dias, não os exercícios/descrições', () => {
    const md = '| TREINO DO DIA | EXERCÍCIO | DESCRIÇÃO |\n|---|---|---|\n| SEGUNDA-FEIRA | LEG 180 | Descida controlada |\n| SEGUNDA-FEIRA | AGACHAMENTO | Joelhos alinhados |';
    expect(extractPlanTexts('treino', md)).toEqual(['TREINO DO DIA', 'SEGUNDA-FEIRA']);
  });

  it('resposta da IA desalinhada é rejeitada', () => {
    expect(parseTranslatedTexts('```json\n["Lunch","Rice"]\n```', ['Almoço', 'Arroz'])).toEqual([['Almoço', 'Lunch'], ['Arroz', 'Rice']]);
    expect(parseTranslatedTexts('["Lunch"]', ['Almoço', 'Arroz'])).toBeNull();
    expect(parseTranslatedTexts('Sure! Lunch', ['Almoço'])).toBeNull();
  });
});

describe('translate-plan — cache do servidor', () => {
  it('tradução já guardada volta na hora, sem chamar a IA', async () => {
    const texts = extractPlanTexts('dieta', DIET_MD);
    const stored: TranslationPair[] = [['Almoço', 'Lunch']];
    const cache = new Map([[`en:${await fakeHash(cacheKeyInput(texts))}`, stored]]);
    const { call, deps } = setup({ cache });
    const res = await call({ planId: PLAN_ID, targetLanguage: 'en' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pairs: stored, cached: true });
    expect(deps.translate).not.toHaveBeenCalled();
  });

  it('primeiro acesso traduz uma vez e salva; o segundo (outro aparelho) vem do cache', async () => {
    const { call, deps } = setup();
    const first = await (await call({ planId: PLAN_ID, targetLanguage: 'en' })).json();
    expect(first.cached).toBe(false);
    expect(first.pairs).toContainEqual(['Almoço', 'EN Almoço']);
    expect(deps.translate).toHaveBeenCalledTimes(1);
    expect(deps.translate).toHaveBeenCalledWith(extractPlanTexts('dieta', DIET_MD), 'en');
    expect(deps.saveCached).toHaveBeenCalledWith(expect.objectContaining({ plan_id: PLAN_ID, language: 'en' }));

    const second = await (await call({ planId: PLAN_ID, targetLanguage: 'en' })).json();
    expect(second).toEqual({ pairs: first.pairs, cached: true });
    expect(deps.translate).toHaveBeenCalledTimes(1);
  });

  it('pedidos simultâneos do mesmo plano usam uma só chamada à IA', async () => {
    const { call, deps } = setup();
    await Promise.all([call({ planId: PLAN_ID, targetLanguage: 'en' }), call({ planId: PLAN_ID, targetLanguage: 'en' })]);
    expect(deps.translate).toHaveBeenCalledTimes(1);
  });

  it('a tradução continua em segundo plano mesmo se o app parar de esperar', async () => {
    const { call, deps } = setup();
    await call({ planId: PLAN_ID, targetLanguage: 'en' });
    expect(deps.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('sem login não traduz; plano de outro aluno (invisível) dá 404', async () => {
    const anon = setup();
    expect((await anon.call({ planId: PLAN_ID, targetLanguage: 'en' }, false)).status).toBe(401);
    const other = setup({ plan: null });
    expect((await other.call({ planId: PLAN_ID, targetLanguage: 'en' })).status).toBe(404);
    expect(anon.deps.translate).not.toHaveBeenCalled();
    expect(other.deps.translate).not.toHaveBeenCalled();
  });

  it('erro da IA vira 502 e nada é salvo', async () => {
    const { call, deps } = setup();
    (deps.translate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('anthropic 500'));
    expect((await call({ planId: PLAN_ID, targetLanguage: 'en' })).status).toBe(502);
    expect(deps.saveCached).not.toHaveBeenCalled();
  });
});

describe('translate-plan — disparo na publicação', () => {
  const publish = { planId: PLAN_ID, targetLanguage: 'en', source: 'publish' };

  it("aluno 'en': responde na hora e traduz/salva em segundo plano, sem login", async () => {
    const { call, deps, background, cache } = setup({ language: 'en' });
    const res = await call(publish, false);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ queued: true });
    await Promise.all(background);
    expect(deps.translate).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);

    // O aluno abre depois: recebe na hora, do cache.
    const opened = await (await call({ planId: PLAN_ID, targetLanguage: 'en' })).json();
    expect(opened.cached).toBe(true);
    expect(deps.translate).toHaveBeenCalledTimes(1);
  });

  it("aluno em português, rascunho ou cardio: não chama a IA", async () => {
    for (const [plan, language] of [[diet(), 'pt'], [diet(), null], [diet({ is_draft: true }), 'en'], [diet({ tipo: 'cardio' }), 'en']] as const) {
      const { call, deps } = setup({ plan, language });
      const res = await call(publish, false);
      expect(res.status).toBe(200);
      expect((await res.json()).skipped).toBeTruthy();
      expect(deps.translate).not.toHaveBeenCalled();
    }
  });

  it('id inválido é recusado', async () => {
    const { call } = setup();
    expect((await call({ ...publish, planId: 'x' }, false)).status).toBe(400);
  });
});
