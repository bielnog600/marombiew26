# Evolução do pipeline de geração de dietas

## Visão geral

Migrar a fonte de verdade da dieta de **markdown → parser → ParsedMeal[]** para **JSON canônico tipado**, com markdown apenas como saída derivada para visualização/PDF. Adicionar camadas explícitas de validação nutricional e contexto de treino estruturado.

```text
Antes:  IA → Markdown → Parser frágil → UI + DB
Depois: IA → JSON canônico (validado) → UI + DB
                       ↓
                 Markdown derivado (visual/PDF)
```

---

## 1. Schema canônico da dieta (`src/lib/dietSchema.ts`)

Nova fonte de verdade, validada por Zod (já usado em outras edge functions). Será compartilhada entre front (`src/lib`) e edge functions (via cópia em `_shared` ou import relativo).

```text
DietPlan
├── meta
│   ├── version: "1.0"
│   ├── generatedAt, model
│   ├── objective: "cutting" | "bulking" | "recomp" | "manutencao" | "performance"
│   ├── strategy: "linear" | "carb_cycle" | "refeed" | "low_carb" | "if" | "custom"
│   ├── style: "tradicional" | "mediterranea" | "low_carb" | "vegana" | "flexivel" | ...
│   └── trainingAware: boolean
├── targets
│   ├── tmb, get, deficit/superavit, kcal
│   └── macros { p, c, g }   (g e %)
├── trainingContext            // resumo estruturado do treino do aluno
│   ├── splitType, weeklySessions
│   └── daysOfWeek: Record<weekday, DayLoad>
│       └── DayLoad { type: "rest"|"upper"|"lower"|"full"|"cardio"|"tabata"|"mixed",
│                     intensity: "low"|"medium"|"high",
│                     timeOfDay?: "manha"|"tarde"|"noite" }
├── days[]                     // 1 (padrão semanal) ou 7 (ciclo)
│   ├── label ("Padrão" | "Segunda" | ...)
│   ├── carbBias: "low"|"normal"|"high"   // para ciclos
│   ├── meals[]
│   │   ├── id, name, time, order
│   │   ├── items[]            // antes "foods"
│   │   │   ├── foodId? (catálogo) | freeText
│   │   │   ├── name, qtyGrams, portionLabel
│   │   │   └── macros { kcal, p, c, g }
│   │   └── totals { kcal, p, c, g }   // calculados
│   └── totals { kcal, p, c, g }
├── tips[], notes[]
└── validation                 // preenchido pela camada de validação
    ├── kcalDelta, macroDeltas
    ├── warnings[], errors[]
    └── status: "ok"|"warning"|"invalid"
```

Vai conviver com `ParsedMeal` (legado) via adaptador, para não quebrar UI atual.

---

## 2. Edge function `diet-agent`: saída estruturada

Mudanças em `supabase/functions/diet-agent/index.ts`:

- Trocar o prompt "responda em markdown" por **OpenAI structured output** (`response_format: { type: "json_schema" }`) com o schema canônico (versão simplificada do schema, validada por Zod no retorno).
- Separar explicitamente no prompt as três camadas:
  1. **Objetivo metabólico** (cutting/bulking/recomp/manutenção/performance) — define direção calórica.
  2. **Estratégia nutricional** (linear / ciclo de carbo / refeed / low carb / IF) — define distribuição entre dias.
  3. **Estilo alimentar** (mediterrânea, tradicional brasileira, vegana, flexível) — define escolha de alimentos.
- Construir `trainingContext` no backend antes de chamar a IA: ler `ai_plans` tipo `'treino'` + parser leve para extrair `daysOfWeek` (rest/upper/lower/cardio/tabata/intensity/timeOfDay). Passar como JSON estruturado, não texto bruto.
- A IA recebe `targets`, `style`, `strategy`, `trainingContext`, `foodCatalog` e devolve `DietPlan` JSON.
- Após a resposta: parsing Zod → se falhar, 1 retry com mensagem de correção; se falhar de novo, erro 422 para o front.
- Gerar markdown derivado no próprio backend usando `dietMarkdownSerializer` (move-se uma cópia para `_shared` ou serializa-se inline) e devolver **ambos**: `{ plan: DietPlan, markdown: string }`.

---

## 3. Camada de validação nutricional (`src/lib/dietValidation.ts`)

Função pura usada após geração, edição e substituição:

```text
validateDietPlan(plan, targets) → {
  status, kcalDelta, macroDeltas, warnings[], errors[]
}
```

Regras:
- Recalcula `meals[].totals` e `days[].totals` a partir dos `items` (não confia nos totais da IA).
- `kcalDelta`: diferença vs `targets.kcal`. `warning` se > 5%, `error` se > 12%.
- `macroDeltas`: diferença por macro. `warning` se > 10g ou > 15%.
- Coerência de cada item: `kcal ≈ p*4 + c*4 + g*9` (tolerância ±15%).
- Items órfãos do catálogo: `warning`.
- Estratégia: se `strategy = carb_cycle`, exige variação de carbo entre dias (>15% diff).

Resultado anexado em `plan.validation`. UI mostra badges.

---

## 4. Edição e substituição também usam o JSON

- `diet-edit-agent`: receber `DietPlan` em vez de `currentMeals`. Continuar usando `actions` (`scale_day`, `modify`, `replace`, `add`, `carb_cycle`) — `applyDietActions` migra para operar sobre `DietPlan`. Após aplicar, **revalida** com `validateDietPlan` e devolve `plan + validation`.
- `FoodSubstitutionDialog`: substituições viram `MealItem`. Após swap → revalidação local; se ultrapassar threshold de erro, exibir aviso antes de aceitar.
- `DietReadjustmentDialog`: mesmo padrão.

---

## 5. Persistência

Em `ai_plans`:
- Continuar salvando `conteudo` (markdown derivado) → preserva compatibilidade total com PDF, portal do aluno e relatórios atuais.
- Adicionar coluna nova `conteudo_json jsonb` (nullable) com o `DietPlan` canônico. Migration simples; sem grants extras (mesma tabela).
- Loader: se `conteudo_json` existir → usa direto. Senão → fallback para parser do markdown (planos antigos).

---

## 6. UI

- `DietaIA.tsx` e `DietPlanEditor.tsx`: passam a consumir `DietPlan` diretamente quando disponível.
- Adaptador `dietPlanToParsedMeals(plan)` mantém compatibilidade com `DietResultCards` / `MealCard` enquanto migra os componentes.
- Novo componente `DietValidationBadge` (chips: ok/warning/invalid com tooltip dos deltas).
- Bloco de **trainingContext** visível no editor: mostra como a IA leu os dias do aluno (transparência para o admin).

---

## Arquivos a criar / alterar

**Novos**
- `src/lib/dietSchema.ts` — tipos + Zod do `DietPlan`
- `src/lib/dietValidation.ts` — validação nutricional
- `src/lib/dietPlanAdapter.ts` — `dietPlanToParsedMeals` / `parsedMealsToDietPlan` (compat)
- `src/lib/trainingContextExtractor.ts` — extrai `trainingContext` estruturado de um plano de treino
- `src/components/diet/DietValidationBadge.tsx`
- Migration: `ai_plans.conteudo_json jsonb`

**Alterados**
- `supabase/functions/diet-agent/index.ts` — JSON structured output + camadas separadas + trainingContext
- `supabase/functions/diet-edit-agent/index.ts` — opera sobre `DietPlan`
- `src/lib/dietAiActions.ts` — actions sobre `DietPlan`
- `src/lib/dietMarkdownSerializer.ts` — adiciona `dietPlanToMarkdown(plan)`
- `src/pages/DietaIA.tsx` — consome `{ plan, markdown }`
- `src/components/diet/AiEditDietDialog.tsx` — envia/recebe `DietPlan`, mostra validation
- `src/components/diet/FoodSubstitutionDialog.tsx` — revalida após swap

**Preservados (sem mudança)**
- `dietResultParser.ts` permanece para planos legados.
- PDF e portal do aluno continuam lendo markdown.

---

## Estratégia de rollout

1. Schema + validação + adaptador (não quebra nada).
2. Migration `conteudo_json`.
3. Edge function devolve `{ plan, markdown }`; front salva ambos mas ainda renderiza via markdown.
4. UI passa a preferir `plan` quando presente.
5. Edição/substituição migram para `DietPlan`.
6. trainingContext estruturado entra no prompt.

Cada etapa é independente e reversível.

---

## Riscos / decisões em aberto

- **Tamanho do JSON vs janela do modelo**: dieta semanal com 7 dias × 6 refeições pode estourar tokens. Mitigação: por padrão gerar **1 dia base + overrides por dia** (só itens que mudam em ciclos), não 7 dias completos.
- **Catálogo de alimentos**: hoje mandamos 250 alimentos. Com structured output isso continua. Avaliar enviar apenas IDs+macros (sem porção textual) para economizar tokens.
- **Compat com planos antigos**: garantido via fallback do parser, mas vale uma migração assíncrona opcional (job que converte markdown → JSON para histórico).

Quer que eu siga com esse plano, ou prefere começar só por uma fatia (ex.: schema + validação + edge function devolvendo JSON, deixando edição/substituição para depois)?