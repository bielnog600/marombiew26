# Dietas — Fases 1 e 2: motor único de nutrição e configuração de macros

Entrega agora apenas as Fases 1 e 2. As fases 3 a 6 (carb cycling, contrato da IA, ajuste automático, publicação atômica) ficam registradas no roadmap e só começam depois que estas estiverem estáveis.

## Fase 1 — Motor único de nutrição

Novo módulo central (`src/lib/nutritionEngine.ts`), único lugar que calcula:
- macros do alimento: `qtyGrams / portion_size` × valores cadastrados na base. Nunca usar 4/4/9 no lugar das calorias oficiais — essa conta serve só para detectar valores suspeitos e mostrar distribuição energética.
- total da refeição, total do dia e diferença para a meta
- papel do alimento: proteína, carboidrato, gordura, misto ou pouco calórico

Nenhum componente recalcula macros por conta própria: validação, cards, editor e PDF passam a chamar o motor.

### Autoridade e versionamento

- **Plano em edição**: a base de alimentos manda. Cada alteração recalcula a partir do registro atual.
- **Plano publicado**: o snapshot nutricional gravado vira a autoridade histórica. Mudar o cadastro de um alimento depois não altera dietas já publicadas.
- Ao abrir/editar um plano histórico, o app compara o snapshot salvo com a base atual e mostra a divergência; atualizar só acontece por ação explícita do treinador.
- Snapshot com versão: `nutritionEngineVersion` no plano e `version` dentro de cada `nutritionSnapshot` (porção, kcal, P/C/G, marca, origem).
- A geração do snapshot definitivo no servidor, dentro da publicação transacional, entra na Fase 6; nesta fase o snapshot é criado no app e já sai versionado, pronto para essa troca.

### Meta do dia única

`dietDayTargets.resolveDayTarget` passa a devolver `{ kcal, p, c, g }` e vira a única forma de obter a meta. Metas do plano, agenda semanal, carb cycling, texto e componentes visuais guardam configuração/origem, nunca uma meta efetiva concorrente.

## Fase 2 — Calorias e macros configuráveis

- escolha da fórmula de gasto energético por regras (peso, altura, idade, %gordura, massa magra, atividade, rotina de treino), com Cunningham permitido sempre que a massa magra for confiável — sem corte rígido de %gordura
- medicamentos, hormônios e termogênicos entram como contexto do aluno e nunca alteram o gasto estimado
- exibição clara de Fórmula, TMB, GET e Meta calórica
- Proteína, Gordura e Carboidrato com campo g/kg e campo em gramas ligados nos dois sentidos, e base selecionável (peso corporal ou massa magra)
- cadeados por macro com regras explícitas:
  - dois travados, um livre → o livre fecha as calorias
  - três travados → só válido se fecharem dentro da tolerância, senão bloqueia
  - dois livres → o app pede qual será o macro de fechamento; nunca divide a diferença sozinho
- combinação impossível mostra erro claro ("essa combinação ultrapassa a meta em 250 kcal"), nunca aceita em silêncio

## Detalhes técnicos

- Novos: `src/lib/nutritionEngine.ts` (cálculo por `foods`, papéis de macro, totais, diferença, snapshot versionado, comparação snapshot × base) e `src/lib/macroConfig.ts` (g/kg bidirecional, base peso/massa magra, travas, macro de fechamento, validação de viabilidade).
- `dietSchema.ts`: `MealItem` ganha `foodId`, `resolutionStatus`, `nutritionSnapshot` (com `version`); `meta` ganha `nutritionEngineVersion`.
- `dietMacroValidation.ts` e `dietValidation.ts` passam a delegar ao motor; a validação nutricional final sempre usa `foods` + gramas.
- `dietDayTargets.ts`: `resolveDayTarget` retorna meta completa de macros mantendo compatibilidade com quem hoje lê só kcal.
- `DietaIA.tsx`: cálculo de TMB/GET movido para o novo seletor de fórmula; novo painel de configuração de macros; remove as duplicações de cálculo existentes.
- Sem migração de banco nesta etapa (as colunas de marca/origem em `foods` pertencem à Fase 4).
- Testes: cálculo pela base ignorando macros vindos da IA, papéis de macro, conversão g/kg ↔ gramas nos dois sentidos, as quatro combinações de travas, erro de combinação inviável, snapshot preservado após mudança na base, meta do dia única.

Ao concluir, informo arquivos alterados, migrations (nenhuma prevista) e como ficou a fonte de verdade.
