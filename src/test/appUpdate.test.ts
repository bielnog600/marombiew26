import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForChunkError, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from '@/lib/appUpdate/chunkReload';
import { createUpdateController, AUTO_APPLY_COOLDOWN_MS, TAKEOVER_TIMEOUT_MS, APPLY_ATTEMPT_KEY } from '@/lib/appUpdate/updateController';
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
  const setup = (opts: { path?: string; visible?: boolean; storage?: ReturnType<typeof memoryStorage>; now?: number } = {}) => {
    const env = { path: opts.path ?? '/minha-area', visible: opts.visible ?? true, now: opts.now ?? 1_000_000 };
    const storage = opts.storage ?? memoryStorage();
    const timers: Array<{ fn: () => void; ms: number; done: boolean }> = [];
    const reload = vi.fn();
    const ctrl = createUpdateController({
      getPathname: () => env.path,
      isVisible: () => env.visible,
      storage: () => storage,
      now: () => env.now,
      reload,
      setTimer: (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; },
      clearTimer: (h) => { (h as { done: boolean }).done = true; },
    });
    const runTimers = () => timers.filter(t => !t.done).forEach(t => { t.done = true; t.fn(); });
    const apply = vi.fn();
    return { env, ctrl, apply, reload, storage, timers, runTimers };
  };
  const flush = () => new Promise(r => setTimeout(r, 0));

  it('no meio do uso não recarrega: só avisa', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    await flush();
    expect(apply).not.toHaveBeenCalled();
    expect(ctrl.getState()).toEqual({ available: true, held: false, stalled: false });
  });

  it('abertura do app com versão esperando não aplica nem recarrega sozinha', async () => {
    const { ctrl, apply, reload, runTimers } = setup();
    ctrl.markAvailable(apply, 'sw|v1'); // onNeedRefresh logo ao abrir
    await flush();
    runTimers();
    expect(apply).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(ctrl.getState().available).toBe(true);
  });

  it('aplica ao ir para segundo plano', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    expect(ctrl.onHidden()).toBe(true);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('aplica quando o usuário toca em Atualizar', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    expect(ctrl.apply('user')).toBe(true);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('controllerchange após a troca recarrega exatamente 1 vez', async () => {
    const { ctrl, apply, reload, runTimers } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    ctrl.apply('user');
    await flush();
    expect(ctrl.onControllerChange()).toBe(true);
    expect(ctrl.onControllerChange()).toBe(false);
    runTimers(); // o prazo de 8 s não recarrega de novo
    expect(ctrl.apply('user')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('controllerchange sem termos pedido a troca não recarrega', () => {
    const { ctrl, apply, reload } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    expect(ctrl.onControllerChange()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('service worker que nunca assume: no máximo 1 reload e depois para', async () => {
    const storage = memoryStorage();
    let reloads = 0;
    let t = 1_000_000;
    // Simula várias aberturas seguidas do app com a mesma versão presa em espera.
    for (let open = 0; open < 6; open++) {
      const { ctrl, apply, reload, runTimers, env } = setup({ storage, now: t });
      ctrl.markAvailable(apply, 'sw|v1');
      env.visible = false;
      ctrl.onHidden();
      await flush();
      runTimers(); // 8 s sem controllerchange
      expect(ctrl.getState().stalled).toBe(apply.mock.calls.length > 0);
      reloads += reload.mock.calls.length;
      t += 60_000;
    }
    expect(reloads).toBe(0);

    // Mesmo o toque do usuário: no máximo 1 reload por tentativa.
    const { ctrl, apply, reload, runTimers } = setup({ storage, now: t });
    ctrl.markAvailable(apply, 'sw|v1');
    ctrl.apply('user');
    await flush();
    ctrl.onControllerChange();
    ctrl.onControllerChange();
    runTimers();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sem assumir em 8 s, não recarrega e pede para fechar e abrir o app', async () => {
    const { ctrl, apply, reload, timers, runTimers } = setup();
    ctrl.markAvailable(apply, 'sw|v1');
    ctrl.apply('user');
    await flush();
    expect(timers[0].ms).toBe(TAKEOVER_TIMEOUT_MS);
    runTimers();
    expect(reload).not.toHaveBeenCalled();
    expect(ctrl.getState()).toEqual({ available: false, held: false, stalled: true });
  });

  it('no máximo 1 tentativa automática a cada 10 minutos', async () => {
    const storage = memoryStorage();
    const first = setup({ storage, now: 1_000_000 });
    first.ctrl.markAvailable(first.apply, 'sw|v1');
    expect(first.ctrl.onHidden()).toBe(true);
    await flush();
    first.runTimers();

    const second = setup({ storage, now: 1_000_000 + AUTO_APPLY_COOLDOWN_MS - 1 });
    second.ctrl.markAvailable(second.apply, 'sw|v2');
    expect(second.ctrl.onHidden()).toBe(false);
    expect(second.ctrl.getState().available).toBe(true); // só o aviso

    const third = setup({ storage, now: 1_000_000 + AUTO_APPLY_COOLDOWN_MS });
    third.ctrl.markAvailable(third.apply, 'sw|v2');
    expect(third.ctrl.onHidden()).toBe(true);
  });

  it('mesma versão em espera já tentada não é aplicada de novo automaticamente', async () => {
    const storage = memoryStorage();
    storage.setItem(APPLY_ATTEMPT_KEY, JSON.stringify({ at: 0, id: 'sw|v1' }));
    const { ctrl, apply } = setup({ storage, now: AUTO_APPLY_COOLDOWN_MS * 10 });
    ctrl.markAvailable(apply, 'sw|v1');
    expect(ctrl.onHidden()).toBe(false);
    expect(ctrl.getState().available).toBe(true);
    expect(ctrl.apply('user')).toBe(true); // o toque continua funcionando
  });

  it('storage indisponível não quebra a atualização', async () => {
    const reload = vi.fn();
    const ctrl = createUpdateController({
      getPathname: () => '/', isVisible: () => true, reload,
      storage: () => { throw new Error('SecurityError'); },
      setTimer: () => 0, clearTimer: () => undefined,
    });
    ctrl.markAvailable(vi.fn(), 'sw|v1');
    expect(ctrl.apply('user')).toBe(true);
  });

  it('nunca recarrega na execução do treino nem com a câmera aberta', async () => {
    const { env, ctrl, apply } = setup({ path: '/treino-execucao' });
    ctrl.markAvailable(apply, 'sw|v1');
    expect(ctrl.onHidden()).toBe(false);
    expect(ctrl.apply('user')).toBe(false);

    env.path = '/minha-area';
    const release = ctrl.hold(); // câmera aberta em outra tela
    expect(ctrl.onHidden()).toBe(false);
    expect(ctrl.getState().held).toBe(true);
    release();
    await flush();
    expect(apply).not.toHaveBeenCalled(); // sair da tela não recarrega sozinho
    expect(ctrl.onHidden()).toBe(true);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
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
