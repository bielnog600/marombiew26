import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, reloadOnceForChunkError, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from '@/lib/appUpdate/chunkReload';
import { createUpdateController, BOOT_APPLY_WINDOW_MS } from '@/lib/appUpdate/updateController';
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
  const setup = (opts: { path?: string; since?: number; visible?: boolean } = {}) => {
    const env = { path: opts.path ?? '/minha-area', since: opts.since ?? 60_000, visible: opts.visible ?? true };
    const ctrl = createUpdateController({ getPathname: () => env.path, sinceLoadMs: () => env.since, isVisible: () => env.visible });
    const apply = vi.fn();
    return { env, ctrl, apply };
  };
  const flush = () => new Promise(r => setTimeout(r, 0));

  it('no meio do uso não recarrega: só avisa', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply);
    await flush();
    expect(apply).not.toHaveBeenCalled();
    expect(ctrl.getState()).toEqual({ available: true, held: false });
  });

  it('aplica ao ir para segundo plano', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply);
    expect(ctrl.onHidden()).toBe(true);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('aplica na abertura do app', async () => {
    const { ctrl, apply } = setup({ since: BOOT_APPLY_WINDOW_MS - 1 });
    ctrl.markAvailable(apply);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('aplica quando o usuário toca em Atualizar', async () => {
    const { ctrl, apply } = setup();
    ctrl.markAvailable(apply);
    expect(ctrl.apply('user')).toBe(true);
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('nunca recarrega na execução do treino nem com a câmera aberta', async () => {
    const { env, ctrl, apply } = setup({ path: '/treino-execucao', since: 0 });
    ctrl.markAvailable(apply);
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
