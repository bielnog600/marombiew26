import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForChunkError, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from '@/lib/appUpdate/chunkReload';
import {
  createUpdateController, isAppShellCache, AUTO_APPLY_COOLDOWN_MS, TAKEOVER_TIMEOUT_MS, APPLY_ATTEMPT_KEY,
  RECOVERY_KEY, RECOVERY_COOLDOWN_MS, SUPPRESS_KEY, SUPPRESS_NOTICE_MS,
} from '@/lib/appUpdate/updateController';
import { isSameUser } from '@/contexts/AuthContext';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
};

describe('erros de parte do app (chunk)', () => {
  it('reconhece as mensagens do Safari, Chrome e ChunkLoadError', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('recarrega só uma vez dentro da janela e volta a permitir depois dela', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage, reload, now: () => 1_000 })).toBe(true);
    expect(reloadOnceForChunkError({ storage, reload, now: () => 5_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1000');
    expect(reloadOnceForChunkError({ storage, reload, now: () => 1_000 + CHUNK_RELOAD_WINDOW_MS })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('sem sessionStorage não recarrega (não há como evitar loop)', () => {
    const reload = vi.fn();
    expect(reloadOnceForChunkError({ storage: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('quando aplicar a versão nova', () => {
  type Opts = { path?: string; visible?: boolean; storage?: ReturnType<typeof memoryStorage>; now?: number; running?: string | null; published?: string | null };
  const setup = (opts: Opts = {}) => {
    const env = { path: opts.path ?? '/minha-area', visible: opts.visible ?? true, now: opts.now ?? 1_000_000, published: opts.published ?? null as string | null };
    const storage = opts.storage ?? memoryStorage();
    const timers: Array<{ fn: () => void; ms: number; done: boolean }> = [];
    const reload = vi.fn();
    const recover = vi.fn(async () => undefined);
    const ctrl = createUpdateController({
      getPathname: () => env.path,
      isVisible: () => env.visible,
      storage: () => storage,
      now: () => env.now,
      reload,
      recover,
      runningVersion: opts.running === undefined ? 'v1' : opts.running,
      fetchPublishedVersion: async () => env.published,
      setTimer: (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; },
      clearTimer: (h) => { (h as { done: boolean }).done = true; },
    });
    const runTimers = () => timers.filter(t => !t.done).forEach(t => { t.done = true; t.fn(); });
    const apply = vi.fn();
    return { env, ctrl, apply, reload, recover, storage, timers, runTimers };
  };
  const flush = () => new Promise(r => setTimeout(r, 0));
  const ready = async (s: ReturnType<typeof setup>, id = 'sw|v1') => { s.ctrl.markAvailable(s.apply, id); await flush(); };

  it('no meio do uso não recarrega: só avisa', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    expect(s.apply).not.toHaveBeenCalled();
    expect(s.ctrl.getState()).toEqual({ available: true, held: false, stalled: false });
  });

  it('abertura do app com versão esperando não aplica nem recarrega sozinha', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    s.runTimers();
    expect(s.apply).not.toHaveBeenCalled();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.ctrl.getState().available).toBe(true);
  });

  it('versão rodando igual à publicada: sem aviso e sem aplicar', async () => {
    const s = setup({ running: 'v2', published: 'v2' });
    await ready(s);
    expect(s.ctrl.getState().available).toBe(false);
    expect(s.ctrl.onHidden()).toBe(false);
    expect(s.ctrl.apply('user')).toBe(false);
    expect(s.apply).not.toHaveBeenCalled();
  });

  it('sem conseguir ler a versão publicada, avisa como antes', async () => {
    const s = setup({ published: null });
    await ready(s);
    expect(s.ctrl.getState().available).toBe(true);
  });

  it('aplica ao ir para segundo plano', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    expect(s.ctrl.onHidden()).toBe(true);
    await flush();
    expect(s.apply).toHaveBeenCalledTimes(1);
  });

  it('aplica quando o usuário toca em Atualizar', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    expect(s.ctrl.apply('user')).toBe(true);
    await flush();
    expect(s.apply).toHaveBeenCalledTimes(1);
  });

  it('controllerchange após a troca recarrega exatamente 1 vez', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    s.ctrl.apply('user');
    await flush();
    expect(s.ctrl.onControllerChange()).toBe(true);
    expect(s.ctrl.onControllerChange()).toBe(false);
    s.runTimers(); // o prazo de 8 s não recarrega de novo
    await flush();
    expect(s.ctrl.apply('user')).toBe(false);
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.recover).not.toHaveBeenCalled();
  });

  it('controllerchange não pedido (outro app atualizou) não recarrega no meio do uso', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    expect(s.ctrl.onControllerChange()).toBe(false);
    await flush();
    expect(s.reload).not.toHaveBeenCalled();
    expect(s.ctrl.getState().available).toBe(true); // só o aviso

    // Ao ir para segundo plano, recarrega uma vez (sem pedir troca de novo).
    s.env.visible = false;
    expect(s.ctrl.onHidden()).toBe(true);
    expect(s.ctrl.onHidden()).toBe(false);
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.apply).not.toHaveBeenCalled();
  });

  it('controllerchange não pedido respeita a trava de 10 min e as telas protegidas', async () => {
    const storage = memoryStorage();
    storage.setItem(APPLY_ATTEMPT_KEY, JSON.stringify({ at: 1_000_000 - 1_000, id: 'sw|v1' }));
    const s = setup({ storage, published: 'v2', path: '/treino-execucao' });
    s.ctrl.onControllerChange();
    await flush();
    s.env.visible = false;
    expect(s.ctrl.onHidden()).toBe(false); // treino aberto
    s.env.path = '/minha-area';
    expect(s.ctrl.onHidden()).toBe(false); // tentou há 1 s
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('travou (8 s sem controllerchange) → remove o SW do app e recarrega 1 vez', async () => {
    const s = setup({ published: 'v2' });
    await ready(s);
    s.ctrl.apply('user');
    await flush();
    expect(s.timers[0].ms).toBe(TAKEOVER_TIMEOUT_MS);
    s.runTimers();
    await flush();
    expect(s.recover).toHaveBeenCalledTimes(1);
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(s.ctrl.onControllerChange()).toBe(false); // não recarrega de novo
    expect(s.reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(s.storage.getItem(RECOVERY_KEY)!)).toMatchObject({ at: 1_000_000, from: 'v1' });
  });

  it('recuperação não repete em menos de 10 min: pede para fechar e abrir', async () => {
    const storage = memoryStorage();
    const first = setup({ storage, published: 'v2' });
    await ready(first);
    first.ctrl.apply('user');
    await flush();
    first.runTimers();
    await flush();
    expect(first.reload).toHaveBeenCalledTimes(1);

    // Volta ainda na versão antiga (rede devolveu a mesma) e o usuário toca de novo.
    storage.setItem(SUPPRESS_KEY, '');
    const second = setup({ storage, published: 'v2', now: 1_000_000 + RECOVERY_COOLDOWN_MS - 1 });
    second.ctrl.markAvailable(second.apply, 'sw|v1');
    await flush();
    // Logo após a recuperação, o aviso fica escondido (item das 24 h).
    expect(second.ctrl.getState().available).toBe(false);
    expect(second.ctrl.apply('user')).toBe(false);
    expect(second.recover).not.toHaveBeenCalled();
    expect(second.reload).not.toHaveBeenCalled();
  });

  it('se a recuperação já foi usada há pouco e trava de novo, não recarrega', async () => {
    const storage = memoryStorage();
    storage.setItem(RECOVERY_KEY, JSON.stringify({ at: 1_000_000 - 60_000, from: 'v0' }));
    storage.setItem(SUPPRESS_KEY, JSON.stringify({ until: 0 }));
    const s = setup({ storage, published: 'v2' });
    // Sem passar pelo aviso escondido: troca já pedida antes da recuperação registrada.
    s.ctrl.markAvailable(s.apply, 'sw|v1');
    await flush();
    expect(s.ctrl.getState().available).toBe(false); // escondido por 24 h
    expect(JSON.parse(storage.getItem(SUPPRESS_KEY)!)).toMatchObject({ until: 1_000_000 + SUPPRESS_NOTICE_MS, running: 'v1', published: 'v2' });
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('SW ainda esperando após a recuperação: esconde o aviso por 24 h e depois volta', async () => {
    const storage = memoryStorage();
    storage.setItem(RECOVERY_KEY, JSON.stringify({ at: 1_000_000, from: 'v1' }));
    const after = setup({ storage, running: 'v2', published: null, now: 1_000_000 + 5_000 });
    await ready(after, 'sw|v2');
    expect(after.ctrl.getState().available).toBe(false);
    expect(after.ctrl.onHidden()).toBe(false);

    const nextDay = setup({ storage, running: 'v2', published: null, now: 1_000_000 + 5_000 + SUPPRESS_NOTICE_MS });
    await ready(nextDay, 'sw|v2');
    expect(nextDay.ctrl.getState().available).toBe(true);

    // Publicação mais nova dentro das 24 h volta a avisar.
    const newer = setup({ storage, running: 'v2', published: 'v3', now: 1_000_000 + 60 * 60 * 1000 });
    await ready(newer, 'sw|v2');
    expect(newer.ctrl.getState().available).toBe(true);
  });

  it('SW que nunca assume, várias aberturas: no máximo 1 reload e depois para', async () => {
    const storage = memoryStorage();
    let reloads = 0;
    let t = 1_000_000;
    for (let open = 0; open < 6; open++) {
      const s = setup({ storage, now: t, published: 'v2' });
      await ready(s);
      s.env.visible = false;
      s.ctrl.onHidden();
      s.ctrl.apply('user');
      await flush();
      s.runTimers(); // 8 s sem controllerchange
      await flush();
      reloads += s.reload.mock.calls.length;
      t += 60_000;
    }
    expect(reloads).toBe(1);
  });

  it('no máximo 1 tentativa automática a cada 10 minutos', async () => {
    const storage = memoryStorage();
    const first = setup({ storage, now: 1_000_000, published: 'v2' });
    await ready(first);
    expect(first.ctrl.onHidden()).toBe(true);

    const second = setup({ storage, now: 1_000_000 + AUTO_APPLY_COOLDOWN_MS - 1, published: 'v2' });
    await ready(second, 'sw|v2');
    expect(second.ctrl.onHidden()).toBe(false);
    expect(second.ctrl.getState().available).toBe(true); // só o aviso

    const third = setup({ storage, now: 1_000_000 + AUTO_APPLY_COOLDOWN_MS, published: 'v2' });
    await ready(third, 'sw|v2');
    expect(third.ctrl.onHidden()).toBe(true);
  });

  it('mesma versão em espera já tentada não é aplicada de novo automaticamente', async () => {
    const storage = memoryStorage();
    storage.setItem(APPLY_ATTEMPT_KEY, JSON.stringify({ at: 0, id: 'sw|v1' }));
    const s = setup({ storage, now: AUTO_APPLY_COOLDOWN_MS * 10, published: 'v2' });
    await ready(s);
    expect(s.ctrl.onHidden()).toBe(false);
    expect(s.ctrl.getState().available).toBe(true);
    expect(s.ctrl.apply('user')).toBe(true); // o toque continua funcionando
  });

  it('storage indisponível não quebra a atualização', async () => {
    const ctrl = createUpdateController({
      getPathname: () => '/', isVisible: () => true, reload: vi.fn(),
      storage: () => { throw new Error('SecurityError'); },
      setTimer: () => 0, clearTimer: () => undefined,
    });
    ctrl.markAvailable(vi.fn(), 'sw|v1');
    await flush();
    expect(ctrl.apply('user')).toBe(true);
  });

  it('apaga só os caches do app, mantendo imagens e fontes', () => {
    expect(isAppShellCache('workbox-precache-v2-https://marombiew26.lovable.app/')).toBe(true);
    expect(isAppShellCache('html-cache')).toBe(true);
    expect(['supabase-images', 'images', 'google-fonts'].some(isAppShellCache)).toBe(false);
  });

  it('nunca recarrega na execução do treino nem com a câmera aberta', async () => {
    const s = setup({ path: '/treino-execucao', published: 'v2' });
    await ready(s);
    expect(s.ctrl.onHidden()).toBe(false);
    expect(s.ctrl.apply('user')).toBe(false);

    s.env.path = '/minha-area';
    const release = s.ctrl.hold(); // câmera aberta em outra tela
    expect(s.ctrl.onHidden()).toBe(false);
    expect(s.ctrl.getState().held).toBe(true);
    release();
    await flush();
    expect(s.apply).not.toHaveBeenCalled(); // sair da tela não recarrega sozinho
    expect(s.ctrl.onHidden()).toBe(true);
    await flush();
    expect(s.apply).toHaveBeenCalledTimes(1);
  });
});

describe('renovação do token', () => {
  const base = { id: 'u1', email: 'a@b.c', updated_at: '2026-11-01', user_metadata: { nome: 'A' }, app_metadata: {} } as any;
  it('mesmo usuário com os mesmos dados mantém a mesma referência', () => {
    expect(isSameUser(base, { ...base })).toBe(true);
  });
  it('dados alterados ou outro usuário trocam a referência', () => {
    expect(isSameUser(base, { ...base, user_metadata: { nome: 'B' } })).toBe(false);
    expect(isSameUser(base, { ...base, id: 'u2' })).toBe(false);
    expect(isSameUser(base, null)).toBe(false);
  });
});
