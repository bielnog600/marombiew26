import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const values = new Map<string, any>();
  const db = {
    get: async (_store: string, key: string) => values.get(key),
    put: async (_store: string, value: any, key: string) => { values.set(key, value); },
    delete: async (_store: string, key: string) => { values.delete(key); },
    clear: async () => values.clear(),
  };
  return { values, db };
});

vi.mock('idb', () => ({ openDB: async () => h.db }));

import { fetchWithCache, getCached, setCache } from '@/lib/offlineCache';

beforeEach(() => {
  h.values.clear();
  vi.useRealTimers();
});

describe('cache offline', () => {
  it('sem rede devolve imediatamente o dado salvo, mesmo antigo', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    h.values.set('plan', { data: { days: ['Segunda'] }, ts: Date.now() - 90 * 24 * 3600 * 1000 });
    const result = await fetchWithCache('plan', async () => { throw new Error('não deve chamar'); });
    expect(result).toEqual({ data: { days: ['Segunda'] }, fromCache: true });
  });

  it('rede pendente sem cache resolve vazio no timeout, nunca loading eterno', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const pending = fetchWithCache('missing', () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(2500);
    await expect(pending).resolves.toEqual({ data: null, fromCache: true });
  });

  it('sucesso online substitui a cópia local', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const result = await fetchWithCache('plan', async () => ({ days: ['Terça'] }));
    expect(result.data).toEqual({ days: ['Terça'] });
    await expect(getCached('plan')).resolves.toEqual({ days: ['Terça'] });
  });

  it('setCache não deixa dados de uma chave interferirem em outra', async () => {
    await setCache('plan:u1', ['A']);
    await setCache('plan:u2', ['B']);
    await expect(getCached('plan:u1')).resolves.toEqual(['A']);
    await expect(getCached('plan:u2')).resolves.toEqual(['B']);
  });
});
