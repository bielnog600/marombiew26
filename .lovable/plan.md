
# Evolução da Geração de Dieta — MAROMBIEW

## 1. Como funciona hoje

**Fluxo de geração (admin):**
DietaIA.tsx → carrega contexto completo do aluno (perfil, antropometria, composição, anamnese, histórico de planos, aderência 14d, último reajuste, questionário) → wizard 6 passos define estratégia/macros → `diet-agent` em modo JSON estruturado (GPT-4o, temp 0.3) → validação Zod + recálculo de totais + similaridade Jaccard + guardrail nutricional → 1× retry automático se falhar → salva em `ai_plans` (`conteudo` markdown + `conteudo_json` estruturado + `protocols` JSON).

**Camadas já existentes:**
- Engine TMB multi-fórmula (Harris-Benedict, Mifflin, Cunningham, Tinsley) com auto-seleção
- `buildLayeredInstructions`: objetivo → estratégia → estilo → contexto de treino
- `DietStrategy` enum (linear/low_carb/carb_cycle/refeed/IF/custom)
- Similaridade por refeição com classificação funcional (7 grupos proteicos, 4 carbo)
- `validateDietNutrition`: piso proteico almoço/jantar ≥30g, café ≥15g, lanche tarde flexível
- Renovação cíclica de 45 dias com `diet-renewal-analyzer` → draft → comparação → publicação
- Check-ins (`diet_checkins`) e reajustes (`diet_readjustments`) alimentando o `historico_processo`
- Edit-agent com 11 operações (carb_cycle, scale_day, swap_food, add_meal, etc.)

**Gaps principais:**
- Estratégia existe no enum mas **não persiste como campo de primeira classe** em `ai_plans` (fica solto em `conteudo_json.meta.strategy`)
- **Não há distinção UI/backend entre "Regenerar" e "Atualizar"** — wizard usa mesmo fluxo
- Substituição por item é **string única**, não array tipado com macros/categorias
- **Suplementação** sai como texto markdown, sem estrutura queryable
- **Saciedade/densidade calórica**, fiber e índice de saciedade dos alimentos: inexistentes
- **Viability score** (aderência esperada × praticidade × custo): inexistente
- Questionário não captura: janela de fome, tempo de preparo, orçamento, contexto social
- **Refeed/calorias livres** são checkbox de protocolo, não recurso estruturado com config (frequência, kcal extras, distribuição)
- Per-dia carb cycling existe em `conteudo_json.days[].carbBias` mas **sem inputs explícitos** de kcal/dia no admin

---

## 2. Plano por Fases

### FASE 1 — Maior impacto, menor risco (estrutura + separação de fluxos)

Objetivo: tornar primeira-classe o que já está implícito + separar Regenerar vs Atualizar.

**Backend:**
1. Migração `ai_plans`: adicionar colunas
   - `diet_strategy text` (balanced/low_carb/high_carb/carb_cycling/intermittent_fasting/refeed_enabled)
   - `strategy_source text` ('ai'|'manual')
   - `supplementation jsonb` (array tipado: `{name, useful, dose, timing, reason}`)
   - `viability_score numeric` (0–100)
   - `viability_breakdown jsonb` (`{adherence, practicality, cost, complexity, familiarity}`)
   - `generation_intent text` ('new'|'regenerate'|'update')
2. `diet-agent` ganha parâmetro `intent`:
   - `regenerate` → força `requireMenuVariation=true`, alta intensidade, troca de fontes principais
   - `update` → preserva ≥70% dos alimentos, ajusta só quantidades/macros, similaridade alta é OK
   - `new` → comportamento atual (decisão IA + similaridade vs histórico)
3. Schema de substituições: `MealItem.substitutions: SubstitutionOption[]` com `{food, qty, kind: 'equivalent'|'higher_satiety'|'lower_density'|'cheaper'|'preferred', macros}`
4. Calculador `computeViabilityScore(plan, questionnaire, adherenceHistory)` rodando após geração.
5. Suplementação estruturada: enum de utilidade (`useful_contextual`/`generally_dispensable`) com whitelist (creatina, whey, cafeína, beta-alanina, ômega-3) e blacklist (BCAA, glutamina, L-carnitina, termogênicos).

**Frontend:**
6. DietaIA: dois botões distintos no topo do plano existente — **"Atualizar dieta"** (mantém base, ajusta macros) e **"Regenerar dieta"** (variação real); botão "Nova dieta" continua iniciando do zero.
7. Wizard Step 2 ganha **seletor de estratégia** com opção "IA decide" + 6 estratégias explícitas.
8. Badge de similaridade já existe — adicionar badge de **"Tipo de mudança"** (`ajuste de quantidades` / `variação real de cardápio`).
9. Card de **Suplementação Útil** vs **Dispensável** com explicação curta por item.
10. Card de **Viability Score** com breakdown (aderência esperada, praticidade, custo, complexidade).

**Regras IA atualizadas (prompt):**
- Hierarquia explícita: Segurança > Macros > Estrutura nutricional > Piso proteico > Aderência (preferidos) > Variação
- "Atualizar" injeta `PRESERVE_BASE=true` no prompt
- "Regenerar" injeta `FORCE_NEW_PRIMARY_SOURCES=true`
- Suplementação: bloquear sugestão de BCAA/glutamina/L-carnitina sem justificativa explícita; whey só se ajuda a fechar piso de proteína

---

### FASE 2 — Estratégia avançada (carb cycling, refeed, g/kg, saciedade)

Objetivo: dar ferramentas reais de estrategista nutricional.

**Backend:**
11. **Macros por g/kg de primeira classe**: wizard Step 3 aceita inputs `protein_gkg`, `fat_gkg`, `carb_strategy` (residual|fixed_gkg|percent); conversão automática para gramas/kcal/% visível no UI antes de gerar. Persistir em `ai_plans.macro_input jsonb`.
12. **Carb cycling estruturado**: novo schema `day_targets[]` em `conteudo_json` com `{weekday, type: LOW|MODERATE|HIGH|REFEED, kcal, p, c, g, linked_training_day_id}`. Admin pode editar antes de gerar; IA recebe targets explícitos por dia.
13. **Refeed/calorias livres** como recurso formal:
    - Toggle `refeed_enabled`, `refeed_frequency` (weekly/biweekly), `refeed_kcal_bonus`, `refeed_distribution` ('1_meal'|'2_meals'|'free_weekly_budget')
    - Persistir em `ai_plans.refeed_config jsonb`
    - Prompt injeta dia(s) de refeed alinhados com treino mais pesado
14. **Substituições por objetivo na IA**: prompt obriga 3 substituições por item principal com categorias (equivalente macro / maior saciedade / menor densidade / mais acessível / dentro das preferências).
15. **Motor de saciedade/densidade** v1: adicionar coluna `foods.satiety_index numeric` e `foods.density_kcal_per_g numeric`; pass inicial com seeding manual/CSV para top 100 alimentos.
16. **`diet-edit-agent` ganha operações novas**: `apply_refeed_day`, `set_day_carb_target`, `swap_for_higher_satiety`, `swap_for_lower_density`.

**Frontend:**
17. Wizard Step 3 redesenhado: tabs `kcal_totais` | `percentual` | `g/kg` com conversão ao vivo.
18. Tela de **distribuição semanal** (matriz 7 dias × tipo de dia) integrada ao treino do dia; admin arrasta para marcar HIGH/LOW/REFEED.
19. **Substituições por refeição** no app do aluno: cada item principal mostra ≥3 alternativas categorizadas em sheet/dialog.
20. Visualização "Dia de hoje" no aluno: badge LOW/MOD/HIGH/REFEED + kcal/macros do dia atual.

---

### FASE 3 — Inteligência de decisão (check-in → ação automática)

Objetivo: fechar o loop check-in → análise → sugestão de ação.

**Backend:**
21. **Check-in inteligente expandido**: `diet_checkins` ganha colunas `peso_atual`, `cintura_cm`, `foto_url`, `retencao_percebida`, `performance_treino_subjetiva`.
22. **Decision engine** (`diet-decision-engine` function) consumindo últimos 2 check-ins + weight_logs + adherence + workout_checkins e produzindo `recommended_action` com regras:
    - peso↓ + cintura↓ + perf OK → `manter`
    - peso/cintura estagnados + adesão OK → `apertar` (sugerir −5% kcal ou −0.5g/kg carbo)
    - fome alta + perf OK → `swap_higher_satiety` (substituir por maior saciedade, manter kcal)
    - peso↓ rápido + perf↓ → `aliviar` (déficit agressivo demais)
    - perf↓ + sono↓ + fadiga↑ → `bloquear_aperto_automatico` + flag de revisão manual
    - >4 semanas no mesmo plano + plateau → `aplicar_refeed` ou `regenerar`
23. Decisões geram entradas em `diet_renewal_analysis` com `decision_type` enriquecido (manter|apertar|aliviar|subir_proteina|ajustar_carbo|aplicar_refeed|regenerar|trocar_densidade|revisao_manual).
24. **Notificação automática para admin** (`behavioral_alerts`) quando decisão exige revisão manual ou quando aluno sinaliza degradação clara.

**Frontend:**
25. **DietRenewalPanel** (consultoria) ganha seção "Sugestões automáticas" com cards de ação proposta + botão "aplicar como draft" ou "ignorar".
26. **Check-in do aluno** com novos campos (medidas opcionais, foto, performance subjetiva).
27. **Cards educativos curtos** no app do aluno (não texto longo): "Por que seu carbo subiu hoje?", "O que é refeed?", etc.

---

### O que NÃO entra (confirmado fora de escopo)

- Protocolos hormonais, fármacos, esteroides, T3/T4, clenbuterol, efedrina, ioimbina
- Nenhuma lógica prescritiva ligada a fármacos
- `usa_hormonios` continua apenas como **contexto interno** (já modifica piso proteico) — nunca como sugestão do sistema

---

## 3. Resumo dos artefatos por fase

| Fase | Migrações | Edge functions | Frontend |
|---|---|---|---|
| 1 | `ai_plans` (+6 colunas) | `diet-agent` (intent), novo `computeViabilityScore` | Botões Atualizar/Regenerar, seletor de estratégia, badges, card de suplementação, card de viability |
| 2 | `foods` (+satiety, density), seed inicial | `diet-edit-agent` (+4 ops), `diet-agent` (carb cycling + refeed estruturado) | Wizard Step 3 redesenhado, matriz semanal, substituições no app do aluno, dia de hoje |
| 3 | `diet_checkins` (+5 colunas) | `diet-decision-engine` (nova), integração com `behavioral_alerts` | Check-in expandido, painel de sugestões automáticas, cards educativos |

---

## 4. Decisões que preciso confirmar com você antes de começar

1. **Confirma a separação Atualizar vs Regenerar com botões distintos no admin** (em vez de detecção automática)?
2. **Viability score**: você quer um número 0–100 com breakdown visual, ou prefere semáforo (verde/amarelo/vermelho) por dimensão?
3. **Saciedade/densidade dos alimentos**: aceito fazer seed manual dos top ~100 alimentos da `foods` table (eu preencho via IA com revisão sua), ou prefere apenas heurística textual no prompt sem coluna nova?
4. **Refeed**: preferência por refeição única, 2 refeições no dia, ou budget semanal de kcal livres?
5. **Quer que eu comece pela Fase 1 inteira como próximo passo**, ou prefere implementar incrementalmente sub-fases (ex: 1a = separar Atualizar/Regenerar + estratégia explícita; 1b = suplementação + viability)?
