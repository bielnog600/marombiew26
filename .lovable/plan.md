# Dietas — Fases 1 e 2: motor único de nutrição e configuração de macros

Entrega agora apenas as Fases 1 e 2, sem depender de fases futuras. As fases 3 a 6 (carb cycling, contrato da IA, ajuste automático, publicação atômica) ficam no roadmap e só começam depois que estas estiverem estáveis.

## Fase 1 — Motor único de nutrição

Novo módulo central (`src/lib/nutritionEngine.ts`), único lugar que calcula:
- macros do alimento: quantidade ÷ porção da base × valores cadastrados. Nunca usar 4/4/9 no lugar das calorias oficiais — essa conta serve só para conferir coerência, mostrar distribuição energética e sinalizar valores suspeitos.
- total da refeição, total do dia e diferença para a meta
- papel do alimento: proteína, carboidrato, gordura, misto ou pouco calórico

Nenhum componente recalcula macros por conta própria: validação, cards, editor e PDF passam a chamar o motor.

### Compatibilidade com planos atuais (sem identificador de alimento)

Ordem de resolução de cada item:
1. tem identificador → busca direta na base
2. sem identificador → correspondência exata pelo nome normalizado (ignora maiúsculas, acentos e espaços)
3. exatamente uma correspondência → usa a base, marcado como "resolvido pelo nome"
4. nenhuma ou mais de uma correspondência → "não validado"

Nada de aproximação silenciosa com produto parecido. Item não validado aparece com aviso e não é apresentado como conferido pela base; a geração e a edição continuam funcionando normalmente (o bloqueio de publicação é da Fase 6).

### Autoridade e versionamento

- **Plano em edição ou dieta nova**: a base manda, acima de qualquer macro guardado no item.
- **Plano publicado com snapshot**: o snapshot manda; a visualização histórica nunca é recalculada em silêncio.
- Ao abrir um plano histórico para atualizar, o app mostra a diferença entre o snapshot salvo e a base atual; atualizar só por ação explícita.
- Versões gravadas: `nutritionEngineVersion` no plano e `version` dentro de cada snapshot (porção, kcal, P/C/G, marca, origem).

### Arredondamento

Precisão total durante os cálculos, arredondamento só na apresentação. P/C/G mantêm ao menos uma casa decimal internamente e o total do dia nunca é a soma de valores já arredondados — acaba a diferença de 2 a 10 kcal.

### Meta do dia única

`resolveDayTarget` passa a devolver `{ kcal, p, c, g }` e vira a única fonte. Quem precisa só de calorias usa `resolveDayTarget(...).kcal` (ou um `resolveDayKcal` que apenas chama a função principal, sem lógica própria). Sem truques de conversão e sem metas concorrentes em outros módulos.

## Fase 2 — Calorias e macros configuráveis

### Escolha da fórmula

Função determinística `selectEnergyFormula(...)` devolvendo fórmula escolhida, TMB, o motivo e as alternativas calculadas. Cunningham fica disponível quando a massa magra é utilizável: número positivo, menor que o peso, fisiologicamente plausível e vinda da composição corporal válida mais recente — sem corte arbitrário de percentual de gordura. Havendo dúvida de qualidade ou data, Cunningham continua selecionável manualmente, com aviso da origem e data da avaliação. A IA não escolhe a fórmula.

Na tela: Fórmula utilizada, TMB, GET e Meta calórica, sempre visíveis.

### Medicamentos e hormônios

Não alteram TMB, GET, fator de atividade nem meta calórica, e nenhum "gasto extra" é somado. São contexto do aluno. A regra atual que mexe na proteína por uso hormonal é revista de forma explícita, não removida em silêncio: os macros passam a vir da configuração em g/kg do treinador.

### Configuração dos macros

- Proteína, Gordura e Carboidrato com campo g/kg e campo em gramas ligados nos dois sentidos
- base selecionável por macro: peso corporal ou massa magra
- cadeados com regras explícitas: dois travados e um livre → o livre fecha as calorias; três travados → só válido se fecharem dentro da tolerância; dois livres → o app pede qual será o macro de fechamento, nunca divide sozinho
- combinação inviável mostra erro claro ("essa combinação ultrapassa a meta em 250 kcal"), nunca aceita em silêncio

## Detalhes técnicos

- Novos: `src/lib/nutritionEngine.ts` (resolução de alimento, cálculo, papéis, totais em precisão integral, snapshot versionado, comparação snapshot × base) e `src/lib/macroConfig.ts` (g/kg bidirecional, base peso/massa magra, travas, macro de fechamento, viabilidade) e `src/lib/energyFormula.ts` (`selectEnergyFormula`).
- `dietSchema.ts`: `MealItem` ganha `foodId`, `resolutionStatus`, `nutritionSnapshot` (com `version`), e `meta` ganha `nutritionEngineVersion`.
- `dietMacroValidation.ts` e `dietValidation.ts` delegam ao motor; validação nutricional sempre por base + gramas.
- `dietDayTargets.ts`: `resolveDayTarget` devolve metas completas; consumidores atuais migrados para `.kcal`.
- `DietaIA.tsx`: passa a usar `selectEnergyFormula` e o novo painel de configuração de macros; as duplicações de cálculo saem.
- Sem migração de banco nesta etapa (colunas de marca/origem em `foods` são da Fase 4).
- Testes: plano novo com identificador; plano legado com nome exato; alimento inexistente; nome ambíguo; snapshot antigo com base alterada; diferença exibida antes de atualizar; consumidor que só usa calorias; soma sem erro de arredondamento; conversão g/kg nos dois sentidos; as quatro combinações de travas; combinação inviável; medicamentos sem efeito na energia.

Ao concluir, informo arquivos alterados, migrations (nenhuma prevista) e como ficou a fonte de verdade.
