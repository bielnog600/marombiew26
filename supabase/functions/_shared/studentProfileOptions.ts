/**
 * Opções do perfil do aluno partilhadas pela ficha (questionário) e pelo
 * formulário do admin. Sem imports: corre no Deno e no app.
 *
 * Objetivo continua a ser texto em students_profile.objetivo (dietas/IA leem
 * o texto): chips unidos por ", " e "Outro: …" no fim.
 */

export const RACA_OPTIONS: { value: string; label: string }[] = [
  { value: 'branco', label: 'Branco' },
  { value: 'pardo', label: 'Pardo' },
  { value: 'negro', label: 'Negro' },
];

export const OBJETIVO_OPTIONS: { value: string; desc?: string }[] = [
  { value: 'Hipertrofia' },
  { value: 'Emagrecimento' },
  { value: 'Definição' },
  { value: 'Recomposição corporal', desc: 'perder gordura e ganhar massa' },
  { value: 'Força' },
  { value: 'Condicionamento físico' },
  { value: 'Saúde e qualidade de vida' },
  { value: 'Mobilidade' },
  { value: 'Performance esportiva' },
  { value: 'Voltar a treinar / reabilitação' },
];

export const OBJETIVO_OUTRO_PREFIX = 'Outro:';

const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Texto normalizado → objetivo (nome do chip e sinónimos). */
const OBJETIVO_SYNONYMS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const add = (value: string, ...words: string[]) => [value, ...words].forEach((w) => { map[norm(w)] = value; });
  add('Hipertrofia', 'ganhar massa', 'ganho de massa', 'ganhar massa muscular', 'ganho de massa muscular',
    'ganhar massa magra', 'ganha massa magra', 'aumentar massa magra', 'ganho de massa magra');
  add('Emagrecimento', 'emagrecer', 'perder peso', 'perda de peso', 'perder gordura', 'perda de gordura');
  add('Definição', 'definir', 'definicao muscular');
  add('Recomposição corporal', 'recomposição', 'recomposição corporal (perder gordura e ganhar massa)',
    'perder gordura e ganhar massa', 'perder gordura e ganhar massa magra', 'emagrecer e ganhar massa', 'emagrecer e ganhar massa magra', 'emagrecer e ganha massa magra');
  add('Força', 'ganhar força', 'ganho de força');
  add('Condicionamento físico', 'condicionamento');
  add('Saúde e qualidade de vida', 'saúde', 'mais saúde', 'ter mais saúde', 'qualidade de vida', 'saúde e bem-estar');
  add('Mobilidade');
  add('Performance esportiva', 'performance', 'desempenho esportivo', 'performance desportiva');
  add('Voltar a treinar / reabilitação', 'voltar a treinar', 'reabilitação', 'voltar a treinar/reabilitação');
  return map;
})();

const matchObjetivo = (piece: string): string | null => OBJETIVO_SYNONYMS[norm(piece).replace(/[.!]+$/, '').trim()] ?? null;

const orderObjetivos = (list: Iterable<string>): string[] => {
  const set = new Set(list);
  return OBJETIVO_OPTIONS.map((o) => o.value).filter((v) => set.has(v));
};

/** Texto do perfil → chips marcados + "Outro objetivo". */
export function parseObjetivo(text: string | null | undefined): { selected: string[]; outro: string } {
  const raw = String(text ?? '').trim();
  if (!raw) return { selected: [], outro: '' };

  const outroParts: string[] = [];
  let rest = raw;
  const m = raw.match(/outro\s*:/i);
  if (m && m.index !== undefined) {
    const after = raw.slice(m.index + m[0].length).trim();
    if (after) outroParts.push(after);
    rest = raw.slice(0, m.index);
  }

  const selected = new Set<string>();
  const leftovers: string[] = [];
  for (const segment of rest.split(/[,;]+/)) {
    const seg = segment.trim().replace(/^e\s+/i, '').replace(/[.!]+$/, '').trim();
    if (!seg) continue;
    const whole = matchObjetivo(seg);
    if (whole) { selected.add(whole); continue; }
    const subs = seg.split(/\s+e\s+/i).map((s) => s.trim()).filter(Boolean);
    if (subs.length > 1) {
      const unmatched: string[] = [];
      for (const s of subs) {
        const hit = matchObjetivo(s);
        if (hit) selected.add(hit); else unmatched.push(s);
      }
      if (unmatched.length) leftovers.push(unmatched.join(' e '));
    } else {
      leftovers.push(seg);
    }
  }
  return { selected: orderObjetivos(selected), outro: [...leftovers, ...outroParts].join(', ') };
}

/** Chips + "Outro objetivo" → texto salvo no perfil. */
export function joinObjetivo(selected: string[], outro: string | null | undefined): string {
  const parts = orderObjetivos(selected);
  const o = String(outro ?? '').replace(/\s+/g, ' ').trim();
  if (o) parts.push(`${OBJETIVO_OUTRO_PREFIX} ${o}`);
  return parts.join(', ');
}

/** Mesmo texto que o admin/ficha gravariam (útil para normalizar o que chega). */
export const normalizeObjetivo = (text: string | null | undefined): string => {
  const { selected, outro } = parseObjetivo(text);
  return joinObjetivo(selected, outro);
};
