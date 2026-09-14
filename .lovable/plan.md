# Geração e edição de dietas — macros confiáveis e controle do treinador

Objetivo: a tabela de alimentos passa a ser a única autoridade nutricional. A IA monta a estrutura (qual alimento e quanto), o app calcula tudo, ajusta porções de forma determinística e só libera a publicação quando os números fecham.

## Fase 1 — Motor único de nutrição

Novo módulo central (`src/lib/nutritionEngine.ts`), único lugar que calcula:
- macros do alimento: `qtyGrams / portion_size` × valores cadastrados (nunca 4/4/9 no lugar das kcal oficiais — a conta 4/4/9 serve só para detectar valores suspeitos)
- total da refeição, total do dia, diferença para a meta
- papel do alimento: proteína, carboidrato, gordura, misto, pouco calórico

Cada item do plano guarda um **snapshot nutricional** (porção, kcal, P/C/G, marca, origem) do momento da publicação, para que alterações futuras no cadastro não mudem dietas antigas em silêncio.

Todo o resto (validação, cards, editor, PDF) passa a chamar esse motor; nada recalcula por conta própria.

## Fase 2 — Calorias e macros configuráveis

- fórmula de gasto energético escolhida por regras (peso, altura, idade, %gordura, massa magra, atividade, treino), com Cunningham permitido sempre que a massa magra for confiável — sem corte rígido de %gordura
- medicamentos/hormônios entram como contexto, nunca alteram o gasto estimado
- exibição clara de Fórmula, TMB, GET e Meta calórica
- Proteína / Gordura / Carboidrato com g/kg e gramas ligados nos dois sentidos, base selecionável (peso corporal ou massa magra)
- cadeados por macro, com regras explícitas: dois travados + um livre → o livre fecha a conta; três travados → só válido se fecharem dentro da tolerância; dois livres → o app pede qual será o macro de fechamento, nunca decide sozinho
- combinação impossível mostra erro ("ultrapassa a meta em 250 kcal"), nunca aceita em silêncio

## Fase 3 — Carb cycling reformulado

- **Calorias variáveis** (padrão): proteína e gordura constantes, carboidrato em g/kg por tipo de dia. As calorias são consequência dos macros.
- **Calorias fixas**: kcal é a restrição; exatamente um macro de fechamento, com aviso quando o resultado ficar extremo.

Por tipo de dia (LOW / MEDIUM / HIGH) mostra g/kg, gramas e kcal. Por dia da semana mostra o treino do plano ativo, o tipo de dia e a meta. Também mostra a média semanal de calorias. Cada dia tem P/C/G/kcal próprios, resolvidos sempre pela mesma função de meta do dia — sem metas concorrentes em outros lugares.

## Fase 4 — A IA no papel certo

- a IA devolve alimento + gramas; kcal/P/C/G que ela envie são descartados
- a IA nunca inventa identificador: sem correspondência confiável, o item volta como "Não validado" (nada de associação automática a um produto parecido)
- item não validado pode ser associado a um alimento existente, cadastrado, substituído ou removido
- a base de alimentos ganha marca, origem, código de barras e identificador externo, com índices de busca; produtos de marca não se misturam com o genérico. A busca mostra nome, marca, kcal/100g, P/C/G e origem.

## Fase 5 — Edição e ajuste automático

No topo do plano: Meta do dia / Atual / Diferença, recalculados na hora, sem nenhuma chamada de IA.

Ações por alimento: editar quantidade, trocar (com comparação lado a lado antes de aplicar), remover, adicionar e transferir para outra refeição. Transferir não mexe na quantidade nem no total do dia.

**Ajustar automaticamente** (determinístico):
- mexe só nas quantidades e respeita o que o treinador editou à mão (item fica bloqueado, com opção de desbloquear)
- limites mínimos/máximos por alimento — nada de arroz de 150 g para 610 g
- prioriza os alimentos do macro que falta ou sobra, altera o menor número de itens possível e não move alimentos entre refeições
- sem solução dentro dos limites: avisa "Não foi possível fechar os macros apenas ajustando quantidades" e oferece o modo opcional "Permitir substituições"
- sempre com prévia item a item (antes/depois) e Cancelar / Aplicar

## Fase 6 — Publicação e planos antigos

Publicar recalcula tudo pelo motor, compara com a meta do dia, valida as tolerâncias (±50 kcal, ±10 P, ±15 C, ±8 G) e só então grava — de forma atômica (plano, metas, carb cycling, protocolos e versão gravam juntos ou nada grava). O texto e o PDF são gerados a partir desse plano, nunca validados separadamente.

Plano antigo abre com aviso "Este plano foi criado antes da validação pela base alimentar", botão Recalcular com base atual e comparação Salvo × Base atual, com decisão manual entre Manter original e Atualizar plano.

## Detalhes técnicos

- Novos: `src/lib/nutritionEngine.ts` (cálculo, papéis, diferença, snapshot), `src/lib/macroConfig.ts` (g/kg bidirecional, travas, macro de fechamento), `src/lib/dietAutoAdjust.ts` (otimizador com bounds e `manualLocked`).
- `dietMacroValidation.ts` e `dietValidation.ts` delegam ao motor; validação final sempre por `foods` + gramas.
- `dietSchema.ts`: `MealItem` ganha `foodId`, `resolutionStatus`, `nutritionSnapshot`, `manualLocked`.
- `carbCycling.ts` reescrito com os dois modos e g/kg por tipo de dia; `weeklyEnergy.ts` guarda modo e macros por dia; `dietDayTargets.resolveDayTarget` passa a devolver `{kcal, p, c, g}` e continua sendo a única fonte.
- Migração aditiva em `foods`: `brand`, `source`, `barcode`, `source_food_id` (nullable) + índices, mantendo RLS atual.
- `diet-agent` / `diet-edit-agent`: novo contrato de saída, sem macros vindos da IA, sem invenção de identificadores.
- Publicação via RPC transacional.
- Testes cobrindo os casos A–J das regras: macros da IA ignorados, item não resolvido bloqueia publicação, item editado à mão preservado, impossibilidade sinalizada, transferência sem mudar o total, snapshot preservado, carb cycling com média semanal, travas incompatíveis bloqueadas, dois macros livres pedem escolha, edição sem chamada de IA.

Ordem de entrega: Fases 1-2, depois 3, depois 4-5, depois 6. Cada fase entra sem quebrar a geração atual.
