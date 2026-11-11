import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { reloadOnceForChunkError } from './chunkReload';

type Factory<T extends ComponentType<any>> = () => Promise<{ default: T }>;

export type PreloadableLazy<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /** Baixa a tela antes de ser aberta; falhas são silenciosas. */
  preload: () => Promise<void>;
};

/**
 * React.lazy que, se a parte do app não puder ser baixada (ex.: deploy novo
 * apagou o arquivo antigo), recarrega a página uma única vez para pegar a
 * versão nova. Se já recarregou há pouco, deixa o erro seguir para a tela de erro.
 */
export function lazyWithRetry<T extends ComponentType<any>>(factory: Factory<T>): PreloadableLazy<T> {
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!pending) {
      pending = factory().catch(error => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };

  const Component = lazy(() =>
    load().catch(error => {
      if (reloadOnceForChunkError()) {
        // Página recarregando: nunca resolve para não mostrar a tela de erro.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }),
  ) as PreloadableLazy<T>;

  Component.preload = () => load().then(() => undefined, () => undefined);
  return Component;
}
