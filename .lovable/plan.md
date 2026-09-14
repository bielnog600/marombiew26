# Geração e edição de dietas — macros confiáveis e controle do treinador

Objetivo: a tabela `foods` passa a ser a única autoridade nutricional. A IA monta a estrutura (alimentos + quantidade), o app calcula tudo, ajusta porções de forma determinística e só libera a publicação quando os números fecham.

## Fase 1 — Motor único de nutrição

Novo módulo central (`src/lib/nutritionEngine.ts`) que passa a ser o único lugar que calcula:
- macros de um alimento (`qtyGrams / portion_size` × valores da base)
- total da refeição, total do dia, diferença para a meta
- classificação automática do papel do alimento: proteína, carboidrato, gordura, misto ou pouco calórico

Tudo que hoje calcula por conta própria (validação, cards, editor, PDF) passa a chamar esse motor. O validador atual baseado no texto da IA é substituído: a checagem final sempre usa `foods` + gramas.

## Fase 2 — Calorias e macros configuráveis

Nova área de configuração antes da geração:
- fórmula de gasto energético escolhida por regras (peso, altura, idade, %gordura, massa magra, atividade, rotina de treino), com Cunningham permitido sempre que a massa magra for confiável — sem corte rígido de %gordura
- medicamentos/hormônios entram como contexto, nunca alteram o gasto estimado
- exibição clara de Fórmula, TMB, GET e Meta calórica
- Proteína / Gordura / Carboidrato com campo g/kg e campo em gramas ligados nos dois sentidos, base selecionável (peso corporal ou massa magra)
- cadeado por macro: os travados são fixos, o livre fecha a conta. Combinação impossível mostra erro explícito ("ultrapassa a meta em 250 kcal"), nunca aceita em silêncio

## Fase 3 — Carb cycling reformulado

Dois modos:
- **Calorias variáveis** (padrão): proteína e gordura constantes, carboidrato em g/kg por tipo de dia (LOW / MEDIUM / HIGH). As calorias do dia seguem o carboidrato.
- **Calorias fixas**: kcal iguais todos os dias; o macro livre se ajusta, com aviso quando o resultado ficar extremo ("a gordura precisaria ficar em 145 g").

Tela por dia da semana mostrando treino do dia (do plano ativo quando existir), tipo de dia, g/kg, gramas de carboidrato e kcal. Cada dia guarda sua própria meta, e o editor daquele dia usa exatamente essa meta.

## Fase 4 — Geração com a IA no papel certo

- Contrato da geração muda para `foodId` + `qtyGrams`; kcal/P/C/G devolvidos pela IA são descartados
- Alimento sugerido que não existe na base aparece marcado como "Não validado", com as opções: associar a um alimento existente, cadastrar, substituir ou remover
- `foods` ganha marca, origem, código de barras e identificador externo, para suportar produtos específicos (Whey Optimum, Skyr Arla, etc.)

## Fase 5 — Edição e ajuste automático

No topo do plano: Meta do dia / Atual / Diferença, recalculados a cada alteração.

Ações por alimento: editar quantidade, trocar (busca na base), remover, adicionar e transferir para outra refeição. Transferência não dispara reajuste — só muda a distribuição.

Botão **Ajustar automaticamente** (sem IA): algoritmo determinístico que mexe só nas quantidades, priorizando os alimentos do macro que está faltando ou sobrando, e mostra uma prévia (antes/depois, item por item) com Cancelar / Aplicar. Substituição de alimentos só no modo opcional "Permitir substituições".

## Fase 6 — Publicação e compatibilidade

Publicação bloqueada com alimento não validado, macros fora da tolerância (±50 kcal, ±10 P, ±15 C, ±8 G) ou meta do dia conflitante. Planos antigos continuam abrindo; quando o recálculo pela base divergir, aparece aviso em vez de alteração silenciosa.

## Detalhes técnicos

- Novo `src/lib/nutritionEngine.ts` (cálculo, papéis de macro, diferença, ajuste determinístico) e `src/lib/macroConfig.ts` (g/kg bidirecional, travas, validação de combinação).
- `dietMacroValidation.ts` e `dietValidation.ts` passam a delegar ao motor; `dietValidation` mantém apenas as regras de estrutura do plano.
- `carbCycling.ts` reescrito com os dois modos e g/kg por tipo de dia; `weeklyEnergy.ts` guarda o modo e os macros por dia; `dietDayTargets.resolveDayTarget` permanece a fonte única e passa a devolver também P/C/G.
- Migração em `foods`: `brand`, `source`, `barcode`, `source_food_id` (nullable) + grants.
- `diet-agent` e `diet-edit-agent`: novo contrato de saída e remoção das instruções que pedem macros à IA.
- Testes novos para motor, travas de macro, carb cycling e ajuste automático.

Ordem de entrega: Fases 1-2, depois 3, depois 4-5, depois 6. Cada fase entra sem quebrar a geração atual.
