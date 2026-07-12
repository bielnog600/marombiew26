# Fase 2C.2B — Ontologia, Revisão Humana e Adjudicação

**Estado:** infraestrutura implementada, aguardando execução da revisão humana real.
**Data:** 2026-07-12
**Pilot selection:** `pilot-2c-2026-07-12-02`
**Classifier run:** `793c8800-a0c2-4acc-ac4d-2d374ecd2076`
**Vocabulary version:** `v1.0` (frozen)

---

## 1. Reclassificação da revisão do AI-agent

Os 30 registos criados por `reviewer_kind = "ai-agent-blinded-v1"` foram preservados
e tiveram apenas o campo `status` alterado de `reviewed` → **`draft_benchmark`**.

- `proposed_metadata`, `field_confidence`, `matched_rules`, snapshots e sugestões originais permanecem imutáveis.
- `reviewer_kind` foi mantido para trilha de auditoria (não sobrescrito).
- Ficam disponíveis como benchmark cego para futura comparação com:
  1. classificador `rules-1.0.0` (baseline)
  2. AI reviewer cego (`draft_benchmark`)
  3. revisor humano cego (`human_first_review`)
  4. revisor humano de segurança (`human_safety_review`)
  5. adjudicação final (`adjudicated` / `finalized`)

Confirmação SQL:

```
SELECT reviewer_kind, status, count(*)
FROM public.exercise_metadata_ground_truth
GROUP BY 1,2;
-- reviewer_kind=ai-agent-blinded-v1, status=draft_benchmark, count=30
```

---

## 2. Vocabulários canônicos (v1.0, frozen)

Persistidos em `public.metadata_vocabularies` (row `version='v1.0'`) e espelhados em
`src/lib/metadataVocabularies.ts`. Não podem ser alterados sem incrementar a versão.

### 2.1 equipment_type — taxonomia hierárquica

**Roots (12):** `machine`, `smith_machine`, `cable`, `free_weight`, `bodyweight`,
`cardio_machine`, `resistance_band`, `medicine_ball`, `stability_ball`, `other`, `unknown`.

**Relações pai → filho:**

```
free_weight
├── barbell
├── dumbbell
└── kettlebell
```

**Regras de match hierárquico** (aplicadas pela camada de métricas, não pelo classificador):

- `prediction=child, gt=parent` → `hierarchical_match` (não conta como erro total)
- `prediction=parent, gt=child` → `hierarchical_match` (perda de granularidade)
- `prediction=dumbbell` vs `gt=free_weight` → hierarchical_match
- `prediction=barbell` vs `gt=dumbbell` → **incorrect** (irmãos sem relação pai-filho)

### 2.2 primary_muscles / secondary_muscles — lista canônica (21)

```
quadriceps, hamstrings, gluteus_maximus, gluteus_medius, adductors,
gastrocnemius, soleus, pectoralis_major, latissimus_dorsi, trapezius,
rhomboids, anterior_deltoid, lateral_deltoid, posterior_deltoid,
biceps_brachii, brachialis, triceps_brachii,
rectus_abdominis, obliques, transverse_abdominis, erector_spinae
```

**Proibidos em campos musculares** (regiões anatômicas / articulações):
`thoracic_spine`, `lumbar_spine`, `knee`, `hip`, `core`.

### 2.3 Aliases aceitos

| Alias                | Canônico             |
|----------------------|----------------------|
| `abs`, `abdominals`, `abdomen`  | `rectus_abdominis`   |
| `gastrocnemios`, `panturrilha`  | `gastrocnemius`      |
| `lombar`, `lombares`            | `erector_spinae`     |

### 2.4 movement_pattern (24 valores oficiais)

`squat, hip_hinge, horizontal_push, vertical_push, horizontal_pull, vertical_pull,
knee_extension, knee_flexion, hip_extension, hip_abduction, hip_adduction,
elbow_flexion, elbow_extension, shoulder_abduction, shoulder_flexion, plantar_flexion,
anti_extension, anti_rotation, trunk_flexion, trunk_extension,
locomotion, jump, mobility, other`.

### 2.5 Regras de `not_applicable`

- `safe_to_failure` → permitido em cardio contínuo, mobilidade e alguns isométricos.
- `axial_load` → **não permite N/A**; valor mínimo é `none`.
- `primary_muscles` → permitido apenas em atividades de cardio global explicitamente declaradas.

---

## 3. Métricas — lógica corrigida (a aplicar após ground truth humana)

Estados por campo:

`exact_match | canonical_alias_match | hierarchical_match | partial_array_match |
incorrect | correct_abstention | unnecessary_abstention | reviewer_unresolved |
not_applicable | not_evaluated`

**Não** contam como erro total:
- `dumbbell` vs `free_weight` (parent/child) → `hierarchical_match`
- `abs` vs `rectus_abdominis` → `canonical_alias_match`
- normalização de acentos e casing

**Não** contam como acerto:
- região anatômica (`knee`, `thoracic_spine`) em campo de músculo → `incorrect`
- alias não documentado → `incorrect`

Métricas de `safe_to_failure` só serão publicadas quando houver ≥ 3 positivos e ≥ 3 negativos na GT. Com os 30 exercícios atuais e apenas 2 positivos previstos, `specificity/sensitivity` ficam suspensas.

---

## 4. Infraestrutura para revisão humana

### 4.1 Schema

- `exercise_metadata_ground_truth.status` expandido:
  `draft | reviewed | draft_benchmark | human_first_review | human_safety_review | adjudicated | finalized | superseded`.
- Novos `reviewer_kind` reservados: `human_blinded_v1`, `human_safety_review_v1`, `adjudicator_v1`.
- **Constraint de integridade:** um registo com `reviewer_kind = 'ai-agent-*'` nunca pode ser alterado para `human_*`. A revisão humana cria **novo registo** (mesmo `exercise_id`, `review_version` incrementado).

### 4.2 `exercise_metadata_adjudications` (nova tabela)

Campos: `exercise_id`, `pilot_selection_id`, `classifier_run_id`, `final_metadata`,
`field_final_status`, `sources_considered`, `reason`, `changed_from_first_human_review`,
`changed_from_safety_review`, `adjudicator_id`, `adjudicated_at`, `vocabulary_version`.
RLS: apenas admins.

### 4.3 Fluxo de revisão humana (a operacionalizar no painel admin)

Etapa 1 — **human_blinded_v1** (primeira revisão humana cega):
- exibe apenas `nome`, `grupo_muscular` legado, imagem, vídeo, ajustes,
  `requires_load_logging`, definições operacionais, vocabulários canônicos;
- **oculta** predição do classificador, revisão do AI agent, confidence, matched_rules e categorias_piloto;
- por campo, revisor escolhe estado: `resolved | not_applicable | insufficient_information | requires_video_review | requires_equipment_confirmation`.

Etapa 2 — **human_safety_review_v1** (segunda revisão, campos de risco):
- campos: `stability_level, technical_complexity, axial_load, lumbar_load, balance_requirement, fatigue_cost, safe_to_failure, contraindications`;
- valores da Etapa 1 **não são pré-preenchidos**;
- preferencialmente segundo profissional; se o mesmo, em sessão separada.

Etapa 3 — **adjudicator_v1** (adjudicação):
- compara rules-1.0.0 × AI-blinded × human_first × human_safety;
- grava divergências, decisão final, razão.

---

## 5. Contadores atuais (pré-revisão humana)

| Métrica | Valor |
|---------|-------|
| Registos AI-blinded reclassificados | 30 |
| Registos `human_first_review` | 0 (aguardando) |
| Registos `human_safety_review` | 0 (aguardando) |
| Adjudicações | 0 (aguardando) |
| `insufficient_information` humano | — |
| `requires_video_review` humano | — |
| Divergências humano × AI-blinded | — |

Todas as linhas marcadas “—” só podem ser preenchidas após a execução real da Etapa 1.

---

## 6. Casos que já foram sinalizados para adjudicação

| Exercício | Campo(s) | Motivo |
|-----------|----------|--------|
| FLEXÃO NÓRDICA | `movement_pattern`, `exercise_class`, `safe_to_failure` | classificador confundiu por token "flexão"; hipótese: knee_flexion, alta complexidade, safe_to_failure=false |
| SUPINO RETO SMITH | `equipment_type` | decidir `smith_machine` (específico) vs `machine` (pai) |
| SUPINO RETO HALTERES, STIFF HALTERES | `equipment_type` | `dumbbell` (específico), pai `free_weight` |
| PRANCHA FRONTAL | `primary_muscles` | não usar `core`; escolher `rectus_abdominis`, `transverse_abdominis`, `obliques` conforme execução |
| MOBILIDADE TORÁCICA | `primary_muscles` | `thoracic_spine` proibido; provável `not_applicable` |
| KICK BACK, GOOD MORNING, HIPEREXTENSÃO LOMBAR 2, MOBILIDADE QUADRIL 3 | `equipment_type`, `movement_pattern` | exigem confirmação por vídeo/imagem |
| REMADA UNILATERAL POLIA | `stability_level`, `balance_requirement` | unilateralidade não implica automaticamente balance alto |

---

## 7. Proposta preliminar rules-1.0.1 (NÃO implementada)

Prioridade: (1) remover falsos positivos; (2) corrigir confiança excessiva; (3) normalizar ontologia; (4) melhorar aliases; (5) aumentar cobertura apenas quando seguro.

Requisitos mínimos:

1. matching por **frase completa antes de tokens**;
2. regra específica para `FLEXÃO NÓRDICA` (mapear para `knee_flexion`, não `horizontal_push`);
3. **word boundaries** no tokenizador;
4. normalização de acentos (`flexão` = `flexao`);
5. aliases de `gastrocnemius` (`panturrilha`, `gastrocnemios`);
6. tratamento do grupo `LOMBAR` → `erector_spinae`;
7. reconhecimento de `POLIA` → `cable`;
8. reconhecimento de `SMITH` → `smith_machine`;
9. reconhecimento de `HALTERES` → `dumbbell`;
10. reconhecimento de `CARDIO` / `PASSADEIRA` / `BICICLETA` → `cardio_machine`;
11. separação do prefixo `MOBILIDADE` **antes** do mapeamento de grupo muscular;
12. abstenção quando o equipamento não estiver explícito;
13. adoção do vocabulário muscular canônico;
14. adoção da taxonomia hierárquica de equipamento.

Confidence deve baixar automaticamente quando a regra vier apenas de token único e não frase.

---

## 8. Confirmações finais

- **Sugestões originais imutáveis:** `exercise_metadata_suggestions` — nenhuma linha alterada. ✅
- **`exercises` inalterada:** nenhum `metadata_status`, `metadata_version`, `metadata_source` alterado. ✅
- **`trainer-agent` inalterado:** nenhum edge function tocado nesta fase. ✅
- **Planos, markdown, conteudo_json inalterados.** ✅
- **`rules-1.0.1` não implementada.** ✅
- **Nenhum novo `classify_one` executado.** ✅
- **Nenhuma sugestão aprovada.** ✅

---

## 9. Próximas ações (aguardando autorização explícita)

1. Operacionalizar UI de revisão humana cega (`human_blinded_v1`) sobre os 30 exercícios.
2. Executar a segunda revisão humana de segurança (`human_safety_review_v1`).
3. Rodar adjudicação e popular `exercise_metadata_adjudications`.
4. Recalcular métricas com a lógica de match ampliada (exact / alias / hierarchical / partial / incorrect / abstentions).
5. Somente então: propor `rules-1.0.1` formal e novo `classifier_run_id`.
6. Somente após comparar rules-1.0.0 × rules-1.0.1 × GT humana: decidir aplicação em `exercises` via `approve_exercise_metadata_suggestion`.

**Parando aqui.** Aguardando aprovação para iniciar a operacionalização da Etapa 1 (revisão humana cega).