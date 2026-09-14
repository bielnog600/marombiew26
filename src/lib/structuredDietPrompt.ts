/**
 * Fase 4 — prompt do modo estruturado.
 *
 * O prompt legado (markdown) pede tabela com Kcal/P/C/G e macros estimados
 * pela IA. Isso contradiz o contrato atual: a IA escolhe foodId + qtyGrams e a
 * base é a autoridade de nome, macros e totais.
 *
 * `buildStructuredUserPrompt` remove as instruções incompatíveis e acrescenta
 * o contrato da Fase 4. O prompt legado continua existindo para o fluxo antigo.
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
- NÃO calcule nem devolva kcal, proteína, carboidrato ou gordura de nenhum item.
- NÃO devolva totais de refeição nem totais do dia: o sistema calcula tudo pela base.
- Respeite a estrutura de refeições, horários, restrições e preferências informadas.
- "foodId": null é permitido SOMENTE para os alimentos previamente autorizados;
  nesse caso use o nome exato da dieta modelo — o sistema marcará o item como
  NÃO VALIDADO para resolução manual.
- Não crie substituições textuais fora da base nesta etapa.
`;

export const buildStructuredUserPrompt = (legacyPrompt: string): string => {
  const kept = String(legacyPrompt ?? '')
    .split('\n')
    .filter((line) => !FORBIDDEN_LINE_PATTERNS.some((re) => re.test(line)));
  return `${kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n${STRUCTURED_CONTRACT_BLOCK}`;
};
