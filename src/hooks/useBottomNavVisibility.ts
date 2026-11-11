import { useEffect, useSyncExternalStore } from 'react';

/**
 * Telas cheias (ex.: Pesar refeição) escondem o menu inferior enquanto estão
 * abertas. Contador para permitir mais de uma tela ao mesmo tempo.
 */
let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isBottomNavHidden = () => hiders > 0;

export function hideBottomNav(): () => void {
  hiders += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    hiders = Math.max(0, hiders - 1);
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useBottomNavHidden(): boolean {
  return useSyncExternalStore(subscribe, isBottomNavHidden, isBottomNavHidden);
}

export function useHideBottomNav(active = true): void {
  useEffect(() => (active ? hideBottomNav() : undefined), [active]);
}
