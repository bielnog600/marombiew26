/**
 * MICRO-HOTFIX — o título da dieta nunca acumula sufixo de versão.
 * A versão vive na coluna `version`; a UI mostra um badge.
 */
const VERSION_SUFFIX = /\s*\((?:v\s*\d+|editada)\)\s*$/i;

export function normalizeDietTitle(title: string | null | undefined): string {
  let out = String(title ?? '').trim();
  let guard = 0;
  while (VERSION_SUFFIX.test(out) && guard < 20) {
    out = out.replace(VERSION_SUFFIX, '').trim();
    guard += 1;
  }
  return out;
}
