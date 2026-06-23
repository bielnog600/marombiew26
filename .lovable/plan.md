
# Reorganização do Wizard da Dieta IA

Antes de tocar em qualquer código, aqui está a nova estrutura proposta. Nada é removido — só **reagrupado, renomeado e remapeado**. O motor de geração (prompt do GPT), o decision engine, o check-in e o `dietActionApplier` continuam funcionando com o mesmo vocabulário interno.

---

## Estrutura atual (hoje, confusa)

```text
Step 1  Rotina e Treino
Step 2  Estilo da Dieta, Fase e Hormônios   ← estilo misturado com fase
Step 3  Atividade e Estratégia              ← "estratégia" = nível atividade
Step 4  Refeições e Preferências            ← nº refeições isolado
Step 5  Ajustes do Protocolo                ← refeed, carb cycling, diet break, platô, sódio, água, calorias, carbo
Step 6  Extras                              ← jejum intermitente escondido aqui
Step 7  Alimentos para Substituição
```

Problemas: jejum em "Extras", protocolos de condução (refeed/diet break) misturados com ajustes finos (sódio/água), nenhuma separação entre "o que a dieta é" e "como ela é conduzida".

---

## Estrutura nova (proposta)

```text
Step 1  Objetivo do Plano
        → fase: cutting | manutenção | bulking | recomp | performance
        → hormônios (mantido aqui, pois muda meta proteica)
        → rotina/treino (dias, horário, intensidade) — fica aqui porque
          objetivo + treino definem juntos a direção do plano

Step 2  Base da Dieta            (era "Estilo da Dieta")
        → Convencional | Flexível/IIFYM | Low Carb | Cetogênica |
          Mediterrânea | Paleolítica | Vegetariana | Vegana
        → "a dieta-mãe"

Step 3  Estratégia da Dieta      (NOVO agrupamento)
        → Linear (default, sem toggle = linear)
        → Refeed
        → Diet Break
        → Carb Cycling (mantém editor estruturado high/med/low)
        → Estratégia para Platô
        → Aliviar Agressividade (mapeado do decision engine)
        → "como a dieta será conduzida ao longo do tempo"

Step 4  Estrutura Alimentar do Dia
        → Número de refeições
        → Distribuição de horários
        → Distribuição treino / descanso
        → Jejum Intermitente        ← MOVIDO de Extras
        → Janela alimentar (se jejum ativo)
        → Reorganização de refeições (meal_change movido para cá)
        → "como o dia alimentar é montado"

Step 5  Ajustes Finos do Protocolo
        → Ajuste de Calorias
        → Ajuste de Carboidrato
        → Ajuste de Sódio
        → Ajuste de Água / Manipulação Hídrica
        → Ajuste de densidade energética
        → Overrides g/kg (proteína, gordura)
        → "refinamentos numéricos que não mudam base nem estratégia"

Step 6  Extras e Observações
        → Suplementação
        → Fitoterapia
        → Observações livres / notas
        → Alimentos para substituição (movido do antigo step 7)
        → "complementos que não afetam a lógica central"
```

---

## Mapeamento das funções existentes → novos steps

Nada some. Apenas muda de lugar.

| Função atual | Step antigo | Step novo |
|---|---|---|
| Estilo da Dieta (8 opções) | 2 | **2 (Base, renomeado)** |
| Fase + Hormônios | 2 | **1 (Objetivo)** |
| Rotina/Treino | 1 | **1 (Objetivo)** |
| Nível de atividade | 3 | **1 (Objetivo)** |
| Nº de refeições | 4 | **4 (Estrutura)** |
| Preferências alimentares | 4 | **6 (Extras)** ou mantido em 4 se preferir — ver pergunta abaixo |
| `refeed` | 5 | **3 (Estratégia)** |
| `diet_break` | 5 | **3 (Estratégia)** |
| `carb_cycling` + editor estruturado | 5 | **3 (Estratégia)** |
| `plato` | 5 | **3 (Estratégia)** |
| `meal_change` | 5 | **4 (Estrutura)** |
| `calorie_adjust` | 5 | **5 (Ajustes Finos)** |
| `carb_adjust` | 5 | **5 (Ajustes Finos)** |
| `sodium_adjust` | 5 | **5 (Ajustes Finos)** |
| `water_adjust` | 5 | **5 (Ajustes Finos)** |
| Jejum intermitente | 6 (Extras → toggle "Emagrecimento rápido") | **4 (Estrutura)** — toggle dedicado |
| Suplementos | 6 | **6 (Extras)** |
| Fitoterapia | 6 | **6 (Extras)** |
| Emagrecimento Rápido (toggle composto) | 6 | desmembrado: jejum → step 4, HIIT/termogênicos → step 6 |
| Alimentos para Substituição | 7 | **6 (Extras)** |

---

## Compatibilidade preservada

1. **IDs internos não mudam.** `refeed`, `carb_cycling`, `diet_break`, `plato`, `meal_change`, `calorie_adjust`, `carb_adjust`, `sodium_adjust`, `water_adjust` continuam com as mesmas chaves em `selectedAdjustments[]`. Só mudam de step visualmente.
2. **Prompt do GPT inalterado** — as seções `=== ESTILO DE DIETA ===`, `=== AJUSTES DO PROTOCOLO ===`, `=== EXTRAS ===` continuam sendo montadas a partir dos mesmos arrays.
3. **Decision Engine** continua emitindo as mesmas `decision_action`. O remapeamento de ação → step fica:
   - `atualizar_dieta` → abre wizard no **Step 5 (Ajustes Finos)**
   - `regenerar_dieta` → abre no **Step 2 (Base)**
   - `aplicar_refeed` → abre no **Step 3 (Estratégia)** com refeed marcado
   - `aliviar_agressividade` → abre no **Step 3 (Estratégia)** com diet_break
   - `reduzir_densidade` → abre no **Step 5 (Ajustes Finos)**
   - `manter` / `revisar_manual` → não abrem wizard
4. **`dietActionApplier`** não muda — ele só usa IDs internos, não números de step.
5. **Check-in / persistência** intactos.
6. **Carb Cycling estruturado** continua disponível quando `carb_cycling` é marcado em Step 3.

---

## Detalhes técnicos

Arquivos afetados (apenas reorganização visual + renomeação):

- `src/pages/DietaIA.tsx` — único arquivo realmente alterado: `STEP_TITLES`, blocos `{currentStep === N && (...)}`, validações `stepValid`, função `StepHeader` e o pequeno bloco "Emagrecimento Rápido" desmembrado.
- `PROTOCOL_ADJUSTMENTS` é partido em três arrays derivados (`STRATEGY_OPTIONS`, `STRUCTURE_OPTIONS`, `FINE_TUNE_OPTIONS`) sem alterar IDs.
- Nenhuma alteração em `dietSchema.ts`, `dietProtocols.ts`, `dietActionApplier.ts`, `dietDecisionEngine.ts`, `diet-agent` edge function ou `ProtocolsDialog.tsx`.

Resumo do diff esperado: ~150 linhas movidas/renomeadas em `DietaIA.tsx`, zero remoções de feature, zero mudanças no backend.

---

## O que eu preciso confirmar antes de implementar

1. **Preferências alimentares** (gosta / não gosta / alergias): ficam no Step 4 (Estrutura) ou no Step 6 (Extras)?
2. **Distribuição treino/descanso de macros**: hoje vive dentro do prompt como derivada. Crio um toggle visível no Step 4 ou mantenho automático?
3. Mantenho o **toggle "Emagrecimento Rápido"** como atalho composto no Step 6 (que ativa jejum+HIIT+termogênicos de uma vez), ou removo o atalho agora que jejum tem seu próprio espaço no Step 4?

Se preferir, posso assumir defaults sensatos (1 → Step 4 · 2 → automático · 3 → remover o atalho composto) e seguir. Me responde com "ok seguir com defaults" ou ajusta o que quiser.
