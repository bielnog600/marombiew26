/**
 * Structured (JSON) prompt sanitizer.
 *
 * The legacy system prompts of diet-agent / trainer-agent are conversational:
 * they instruct the model to ask questions one at a time, to render Markdown
 * tables and to write WhatsApp messages. None of that is valid in structured
 * (JSON) mode.
 *
 * The sanitizer works structurally (section → sentence), not with ad-hoc regex
 * on isolated phrases:
 *   1. The prompt is split into sections delimited by `=====` rules.
 *   2. Sections whose header is conversational / output-format oriented are
 *      dropped entirely.
 *   3. Inside the remaining sections, individual sentences that carry a
 *      forbidden instruction are removed, so surrounding technical/safety
 *      content is preserved verbatim.
 */

const DELIM = /^\s*={5,}\s*$/;

/** Headers of sections that must NEVER reach a structured (JSON) call. */
const FORBIDDEN_SECTION_HEADER =
  /(WHATSAPP|MENSAGENS|COLETA DE DADOS|REGRAS DO FLUXO|SEÇÕES FINAIS|FORMATO DA TABELA|TABELA)/i;

/** Sentences that must be stripped wherever they appear. */
const FORBIDDEN_SENTENCE = [
  /whatsapp/i,
  /whatsappmessages/i,
  /uma pergunta por vez/i,
  /comece perguntando/i,
  /pergunte apenas/i,
  /(não|nao|jamais) pergunte/i,
  /perguntas? (ao|para o) aluno/i,
  /após a tabela/i,
  /tabela markdown/i,
  /tabela do (treino|cardápio|cardapio)/i,
  /\bcolunas\b/i,
  /só gere tabelas/i,
  /células da tabela/i,
  /linha "?total"?/i,
  /justificativa técnica/i,
  /confiança da geração/i,
  /resumo nutricional/i,
  /\|\s*refeição\s*\|/i,
  /^#{1,3}\s/,
] as const;

const isForbiddenSentence = (s: string) =>
  FORBIDDEN_SENTENCE.some((re) => re.test(s));

const sanitizeLine = (line: string): string | null => {
  if (!line.trim()) return line;
  // Split into sentences but keep terminators, so technical prose survives.
  const parts = line.split(/(?<=[.!?])\s+/);
  const kept = parts.filter((p) => !isForbiddenSentence(p));
  if (kept.length === 0) return null;
  const out = kept.join(" ").trim();
  return out.length > 0 ? out : null;
};

export function sanitizeStructuredPrompt(prompt: string): string {
  const lines = prompt.split("\n");
  type Section = { header: string; body: string[] };
  const sections: Section[] = [{ header: "", body: [] }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (DELIM.test(line) && lines[i + 1] !== undefined && DELIM.test(lines[i + 2] ?? "")) {
      sections.push({ header: lines[i + 1].trim(), body: [] });
      i += 2;
      continue;
    }
    sections[sections.length - 1].body.push(line);
  }

  const out: string[] = [];
  for (const section of sections) {
    if (section.header && FORBIDDEN_SECTION_HEADER.test(section.header)) continue;
    if (section.header) {
      out.push("========================================");
      out.push(section.header);
      out.push("========================================");
    }
    for (const line of section.body) {
      const sanitized = sanitizeLine(line);
      if (sanitized !== null) out.push(sanitized);
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
