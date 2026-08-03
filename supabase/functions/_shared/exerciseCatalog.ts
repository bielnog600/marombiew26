/**
 * Catálogo real de exercícios (tabela public.exercises).
 *
 * Objetivo: garantir que o plano gerado pela IA use SOMENTE nomes que existem
 * no banco — inclusive quando o professor cola um "treino de referência"
 * (ex: vindo do ChatGPT) com nomes livres tipo "Hip Thrust Smith",
 * "Romanian Deadlift", "Panturrilha sentada".
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CatalogEntry {
  nome: string;
  grupo: string;
}

export async function loadExerciseCatalog(): Promise<CatalogEntry[]> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.warn("exerciseCatalog: missing service role env");
    return [];
  }
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("exercises")
      .select("nome, grupo_muscular")
      .order("grupo_muscular", { ascending: true })
      .order("nome", { ascending: true });
    if (error) {
      console.warn("exerciseCatalog: query error", error.message);
      return [];
    }
    return (data ?? [])
      // deno-lint-ignore no-explicit-any
      .map((r: any) => ({
        nome: String(r.nome ?? "").trim(),
        grupo: String(r.grupo_muscular ?? "OUTROS").trim() || "OUTROS",
      }))
      .filter((e) => e.nome.length > 0);
  } catch (e) {
    console.warn("exerciseCatalog: unexpected error", e);
    return [];
  }
}

export function buildCatalogBlock(entries: CatalogEntry[]): string {
  const byGroup = new Map<string, string[]>();
  for (const e of entries) {
    const list = byGroup.get(e.grupo) ?? [];
    list.push(e.nome);
    byGroup.set(e.grupo, list);
  }
  const sections = [...byGroup.entries()]
    .map(([grupo, names]) => `--- ${grupo.toUpperCase()} ---\n${names.join(", ")}`)
    .join("\n\n");

  return `
========================================
BANCO DE EXERCÍCIOS (OBRIGATÓRIO — LISTA REAL DO SISTEMA)
========================================

REGRA ABSOLUTA: Todos os exercícios nas colunas EXERCÍCIO e VARIAÇÃO devem ser copiados EXATAMENTE como aparecem abaixo (mesma grafia, acentos e abreviações). É PROIBIDO inventar nomes ou usar nomes de outra fonte.

${sections}

REGRA DE SEPARAÇÃO: CORE e ABDOMEN são grupos musculares DISTINTOS. CORE = estabilização global anti-rotação/anti-extensão. ABDOMEN = flexão de tronco. Não misture os dois a menos que o dia liste ambos explicitamente.

REGRA PARA TREINO DE REFERÊNCIA COLADO PELO PROFESSOR:
- O treino de referência define a ESTRUTURA (divisão, ordem, grupos, séries e faixas de repetição), NUNCA os nomes finais.
- Para CADA exercício da referência, escolha o item MAIS EQUIVALENTE desta lista e escreva o nome DA LISTA.
- Exemplos de tradução obrigatória: "Hip Thrust" → ELEVAÇÃO PÉLVICA; "Romanian Deadlift"/"Stiff com barra" → STIFF ROMENO; "Bulgarian Split Squat" → BÚLGARO; "Hack Squat" → HACK MACHINE; "Panturrilha em pé" → GÊMEOS EM PÉ; "Panturrilha sentada" → GÊMEOS SENTADO; "Abdutora" → CADEIRA ABDUTORA; "Extensora" → CADEIRA EXTENSORA; "Flexora deitada" → MESA FLEXORA; "Remada T-Bar" → REMADA CAVALINHO; "Crucifixo invertido" → CRUCIFIXO INVERSO; "Rosca martelo" → BÍCEPS MARTELO; "Prancha" → PRANCHA FRONTAL.
- Se algum exercício da referência não tiver equivalente na lista, use o mais próximo do MESMO grupo muscular e explique a troca na coluna DESCRIÇÃO. NUNCA mantenha o nome de fora do banco.
`;
}

// ---------------- name matching ----------------

const norm = (s: string): string =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

/** Sinônimos comuns em treinos colados de fora do sistema. */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bHIP THRUST\b/g, "ELEVACAO PELVICA"],
  [/\bPONTE DE GLUTEO\b/g, "ELEVACAO PELVICA"],
  [/\bROMANIAN DEADLIFT\b/g, "STIFF ROMENO"],
  [/\bTERRA ROMENO\b/g, "STIFF ROMENO"],
  [/\bBULGARIAN SPLIT SQUAT\b/g, "BULGARO"],
  [/\bSPLIT SQUAT\b/g, "BULGARO"],
  [/\bHACK SQUAT\b/g, "HACK MACHINE"],
  [/\bPANTURRILHA\b/g, "GEMEOS"],
  [/\bABDUTORA\b/g, "CADEIRA ABDUTORA"],
  [/\bADUTORA\b/g, "CADEIRA ADUTORA"],
  [/\bEXTENSORA\b/g, "CADEIRA EXTENSORA"],
  [/\bFLEXORA DEITADA\b/g, "MESA FLEXORA"],
  [/\bFLEXORA SENTADA\b/g, "CADEIRA FLEXORA"],
  [/\bT BAR\b/g, "CAVALINHO"],
  [/\bTBAR\b/g, "CAVALINHO"],
  [/\bINVERTIDO\b/g, "INVERSO"],
  [/\bINVERTIDA\b/g, "INVERSO"],
  [/\bDESENVOLVIMENTO\b/g, "DESENV"],
  [/\bROSCA MARTELO\b/g, "BICEPS MARTELO"],
  [/\bMARTELO\b/g, "BICEPS MARTELO"],
  [/\bPRANCHA\b/g, "PRANCHA FRONTAL"],
  [/\bBARRA W\b/g, "BARRA W"],
  [/\bCABO\b/g, "POLIA"],
  [/\bPECK DECK\b/g, "PECK DECK"],
];

const canonical = (s: string): string => {
  let out = norm(s);
  for (const [re, rep] of SYNONYMS) out = out.replace(re, rep);
  return out.replace(/\s+/g, " ").trim();
};

const STOP = new Set(["DE", "DA", "DO", "COM", "EM", "NA", "NO", "E", "A", "O", "PARA"]);

const tokens = (s: string): string[] =>
  canonical(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));

const tokenEq = (a: string, b: string): boolean => {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min >= 4 && (a.startsWith(b.slice(0, min)) || b.startsWith(a.slice(0, min)))) return true;
  return false;
};

export function scoreNames(query: string, candidate: string): number {
  const a = tokens(query);
  const b = tokens(candidate);
  if (a.length === 0 || b.length === 0) return 0;
  let matched = 0;
  const used = new Set<number>();
  for (const ta of a) {
    for (let i = 0; i < b.length; i++) {
      if (used.has(i)) continue;
      if (tokenEq(ta, b[i])) {
        used.add(i);
        matched++;
        break;
      }
    }
  }
  return (2 * matched) / (a.length + b.length);
}

export interface MatchResult {
  nome: string;
  score: number;
}

export function findBestCatalogMatch(
  name: string,
  entries: CatalogEntry[],
): MatchResult | null {
  if (!name.trim() || entries.length === 0) return null;
  const q = canonical(name);
  const exact = entries.find((e) => canonical(e.nome) === q);
  if (exact) return { nome: exact.nome, score: 1 };

  let best: MatchResult | null = null;
  for (const e of entries) {
    const s = scoreNames(name, e.nome);
    if (!best || s > best.score) best = { nome: e.nome, score: s };
  }
  return best;
}

const MATCH_THRESHOLD = 0.6;

/**
 * Substitui nomes de exercícios/variações por nomes reais do banco.
 * Retorna a lista de nomes que não tiveram equivalente confiável.
 */
// deno-lint-ignore no-explicit-any
export function snapPlanToCatalog(plan: any, entries: CatalogEntry[]): string[] {
  if (!plan || !Array.isArray(plan.days) || entries.length === 0) return [];
  const unmatched: string[] = [];
  const cache = new Map<string, string | null>();

  const resolve = (raw: string): string | null => {
    const key = canonical(raw);
    if (cache.has(key)) return cache.get(key)!;
    const m = findBestCatalogMatch(raw, entries);
    const out = m && m.score >= MATCH_THRESHOLD ? m.nome : null;
    cache.set(key, out);
    return out;
  };

  for (const day of plan.days) {
    if (!Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      const original = String(ex.exercise ?? "").trim();
      if (original) {
        const fixed = resolve(original);
        if (fixed) ex.exercise = fixed;
        else unmatched.push(original);
      }
      const variation = String(ex.variation ?? "").trim();
      if (variation && variation !== "-" && variation !== "—") {
        const fixedVar = resolve(variation);
        if (fixedVar) ex.variation = fixedVar;
        else unmatched.push(variation);
      }
    }
  }
  return [...new Set(unmatched)];
}
