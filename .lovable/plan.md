# Dietas — Fases 1 e 2: motor único de nutrição e configuração de macros

Entrega apenas as Fases 1 e 2, sem depender das fases seguintes. Ao terminar, paro e apresento o relatório completo.

## Fase 1 — Motor único de nutrição

Novo módulo central (`src/lib/nutritionEngine.ts`), único lugar que calcula:
- macros do alimento: quantidade ÷ porção da base × valores cadastrados. Nunca usar 4/4/9 no lugar das calorias oficiais — essa conta serve só para conferir coerência, mostrar distribuição energética e sinalizar valores suspeitos.
- total da refeição, total do dia e diferença para a meta
- papel do alimento: proteína, carboidrato, gordura, misto ou pouco calórico

Nenhum componente recalcula macros por conta própria: validação, cards, editor e PDF passam a chamar o motor.

### Compatibilidade com planos atuais

Status de resolução padronizado em quatro valores:
- **resolved_by_id** — o item já traz o identificador do alimento e ele existe na base
- **resolved_by_name** — plano antigo sem identificador, com exatamente uma correspondência pelo nome normalizado (ignora maiúsculas, acentos e espaços)
- **unresolved** — nenhuma correspondência ou nome ambíguo
- **snapshot** — item de plano publicado exibido pelos valores gravados

Nada de aproximação silenciosa com produto parecido. Item não validado mostra aviso e não conta como conferido pela base; geração e edição continuam funcionando (o bloqueio de publicação é da Fase 6).

### Autoridade e versionamento

- **Plano em edição (rascunho) ou dieta nova**: a base manda, acima de qualquer macro guardado no item.
- **Plano publicado com snapshot**: o snapshot manda na exibição histórica; nada é recalculado em silêncio.
- Plano publicado aberto para edição: o app compara snapshot × base atual, mostra a divergência e só atualiza por ação explícita.
- Versões gravadas: `nutritionEngineVersion` no plano e `version` dentro de cada snapshot. O snapshot guarda porção, kcal, P/C/G e, opcionalmente, marca e origem — sem nenhuma migração de banco nesta etapa.

### Arredondamento

Precisão total durante os cálculos, arredondamento só na apresentação. P/C/G mantêm ao menos uma casa decimal internamente e o total do dia nunca é a soma de valores já arredondados — acaba a diferença de 2 a 10 kcal.

### Meta do dia única

`resolveDayTarget` passa a devolver `{ kcal, p, c, g }` e vira a única fonte. Quem precisa só de calorias usa `resolveDayTarget(...).kcal` (ou um `resolveDayKcal` que apenas chama a função principal, sem lógica própria). Sem truques de conversão e sem metas concorrentes.

## Fase 2 — Calorias e macros configuráveis

### Escolha da fórmula

Função determinística `selectEnergyFormula(...)` devolvendo fórmula, TMB, motivo e alternativas calculadas. Cunningham fica disponível quando a massa magra é utilizável: número positivo, menor que o peso, fisiologicamente plausível e vinda da composição corporal válida mais recente — sem corte arbitrário de percentual de gordura. Havendo dúvida de qualidade ou data, Cunningham continua selecionável manualmente, com aviso da origem e data. A IA não escolhe a fórmula.

Na tela: Fórmula utilizada, TMB, GET e Meta calórica, sempre visíveis.

### Medicamentos e hormônios

Não alteram TMB, GET, fator de atividade nem meta calórica, e nenhum "gasto extra" é somado. São contexto do aluno. A regra atual que mexe na proteína por uso hormonal é revista de forma explícita, não removida em silêncio: os macros passam a vir da configuração do treinador.

### Configuração dos macros

- Proteína, Gordura e Carboidrato com campo g/kg e campo em gramas ligados nos dois sentidos
- base selecionável por macro: peso corporal ou massa magra
- cadeados com regras explícitas: dois travados e um livre → o livre fecha as calorias; três travados → só válido se fecharem dentro da tolerância; dois livres → o app pede qual será o macro de fechamento, nunca divide sozinho
- combinação inviável mostra erro claro ("essa combinação ultrapassa a meta em 250 kcal"), nunca aceita em silêncio

## Fora do escopo desta entrega

Tipos de dia LOW/MEDIUM/HIGH, novo carb cycling, ajuste automático de quantidades, contrato definitivo da IA por identificador, migração da base de alimentos, publicação transacional e bloqueio de publicação. Só deixo as interfaces preparadas onde for necessário.

## Detalhes técnicos

- Novos: `src/lib/nutritionEngine.ts` (resolução de alimento, cálculo, papéis, totais em precisão integral, snapshot versionado, comparação snapshot × base), `src/lib/macroConfig.ts` (g/kg bidirecional, base peso/massa magra, travas, macro de fechamento, viabilidade) e `src/lib/energyFormula.ts` (`selectEnergyFormula`).
- `dietSchema.ts`: `MealItem` ganha `foodId`, `resolutionStatus`, `nutritionSnapshot` (com `version`, marca e origem opcionais); `meta` ganha `nutritionEngineVersion`.
- `dietMacroValidation.ts` e `dietValidation.ts` delegam ao motor; validação nutricional sempre por base + gramas.
- `dietDayTargets.ts`: `resolveDayTarget` devolve metas completas; consumidores migrados para `.kcal`.
- `DietaIA.tsx`: passa a usar `selectEnergyFormula` e o novo painel de configuração de macros; saem as duplicações de cálculo.
- Plano em edição × publicado resolvido pelo campo de rascunho já existente no plano.
- Nenhuma migração de banco.
- Testes: plano com identificador; plano antigo com nome exato; alimento inexistente; nome ambíguo; snapshot antigo com base alterada; divergência exibida antes de atualizar; consumidor que só usa calorias; soma sem erro de arredondamento; conversão g/kg nos dois sentidos; as quatro combinações de travas; combinação inviável; medicamentos sem efeito na energia.

Relatório final: arquivos novos, arquivos alterados, testes adicionados e resultado, migrations (esperado: nenhuma), comportamento antigo preservado, pontos que ainda dependem das Fases 3-6 e um exemplo real de dieta existente recalculada mostrando a base como fonte nutricional na edição.
