/**
 * Prompt do modo ESTRUTURADO (Fase 4.2).
 *
 * Construção POSITIVA: o prompt é montado apenas com os dados necessários.
 * Não existe mais sanitização por regex do prompt legado no caminho structured
 * (`buildStructuredUserPrompt` fica apenas como compatibilidade temporária).
 *
 * A IA escolhe foodId + qtyGrams + estrutura das refeições.
 * A base `foods` é a autoridade de nome, macros e totais.
 */

const FORBIDDEN_LINE_PATTERNS: RegExp[] = [
  /devolva\s+kcal/i,
  /macros?\s+estimad/i,
  /kcal\s*\/\s*p\s*\/\s*c\s*\/\s*g/i,
  /preencha\s+sempre\s+kcal/i,
  /coluna\s+"?substitui/i,
  /substitui[çc][ãa]o\s+deve\s+conter/i,
  /formato da coluna/i,
  /a tabela deve ter as colunas/i,
  /\|\s*kcal\s*\|/i,
  /kcal\s*\|\s*p\s*\|\s*c\s*\|\s*g/i,
  /linha de total/i,
  /total de cada refei[çc][ãa]o e do dia/i,
  /total di[áa]rio no final/i,
  /em tabela com/i,
  /tabela markdown/i,
  /mensagens prontas para whatsapp/i,
];

export const STRUCTURED_CONTRACT_BLOCK = `
=== CONTRATO DE SAÍDA (OBRIGATÓRIO) ===
- Escolha os alimentos SOMENTE entre os IDs do FOOD CATALOG desta requisição.
- Cada item deve conter apenas "foodId" (UUID do catálogo) e "qtyGrams" (> 0).
- NUNCA informe calorias, proteína, carboidrato ou gordura de nenhum item.
- NUNCA informe totais de refeição nem totais do dia: o sistema calcula tudo pela base.
- Respeite a estrutura de refeições, horários, restrições e preferências informadas.
- "foodId": null é permitido SOMENTE para os alimentos previamente autorizados;
  nesse caso use o nome exato da dieta modelo — o sistema marcará o item como
  NÃO VALIDADO para resolução manual.
- Não crie substituições textuais fora da base nesta etapa.
`;

export const MODEL_DIET_RULES_BLOCK = `
=== DIETA MODELO (REGRAS OBRIGATÓRIAS) ===
1) Preserve EXATAMENTE os mesmos alimentos da dieta modelo, na MESMA ordem, refeição por refeição.
2) Ajuste apenas as QUANTIDADES (qtyGrams) para atingir as metas determinísticas.
3) Troque um alimento SOMENTE quando houver restrição, alergia ou incompatibilidade explícita.
4) Alimento previamente identificado como sem cadastro: "foodId": null com o nome exato da dieta modelo (ficará como NÃO VALIDADO para resolução manual).
5) Ignore quaisquer calorias, macros, "Estimativa" ou "TOTAL DIÁRIO" escritos na dieta modelo.
`;

export interface StructuredPromptInput {
  studentContext?: string;
  routine?: string;
  training?: string;
  phase?: string;
  strategy?: string;
  style?: string;
  meals?: string;
  restrictions?: string;
  preferences?: string;
  targets?: string;
  carbCycling?: string;
  modelDiet?: string;
  allowedUnresolved?: string[];
  extras?: string;
}

const block = (title: string, body?: string | null): string => {
  const content = String(body ?? '').trim();
  if (!content) return '';
  return `=== ${title} ===\n${content}\n`;
};

/** Construção positiva do prompt structured. */
export const buildStructuredDietPrompt = (input: StructuredPromptInput): string => {
  const parts = [
    'Monte o plano alimentar escolhendo alimentos do FOOD CATALOG desta requisição.',
    block('CONTEXTO DO ALUNO', input.studentContext),
    block('ROTINA DO ALUNO', input.routine),
    block('TREINO', input.training),
    block('FASE ATUAL', input.phase),
    block('ESTRATÉGIA', input.strategy),
    block('ESTILO DE DIETA', input.style),
    block('REFEIÇÕES (NOME E HORÁRIO)', input.meals),
    block('RESTRIÇÕES OBRIGATÓRIAS', input.restrictions),
    block('PREFERÊNCIAS', input.preferences),
    block('METAS DETERMINÍSTICAS (DEFINITIVAS — NÃO RECALCULE)', input.targets),
    block('CARB CYCLING — METAS POR DIA', input.carbCycling),
    block('EXTRAS', input.extras),
  ].filter(Boolean);

  if (String(input.modelDiet ?? '').trim()) {
    parts.push(MODEL_DIET_RULES_BLOCK.trim() + '\n');
    parts.push(block('DIETA MODELO', input.modelDiet));
  }

  const allowed = (input.allowedUnresolved ?? []).filter((n) => String(n ?? '').trim());
  if (allowed.length > 0) {
    parts.push(
      block(
        'ALIMENTOS AUTORIZADOS SEM CADASTRO (foodId: null)',
        allowed.map((n) => `- ${n}`).join('\n'),
      ),
    );
  }

  parts.push(STRUCTURED_CONTRACT_BLOCK.trim());
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * @deprecated Compatibilidade temporária: sanitização do prompt legado.
 * O caminho structured usa `buildStructuredDietPrompt`.
 */
export const buildStructuredUserPrompt = (legacyPrompt: string): string => {
  const kept = String(legacyPrompt ?? '')
    .split('\n')
    .filter((line) => !FORBIDDEN_LINE_PATTERNS.some((re) => re.test(line)));
  return `${kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n${STRUCTURED_CONTRACT_BLOCK}`;
};
