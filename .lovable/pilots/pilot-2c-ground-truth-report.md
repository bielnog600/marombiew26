# Fase 2C.2 — Relatório de Ground Truth e Comparação

**classifier_run_id**: `793c8800-a0c2-4acc-ac4d-2d374ecd2076`
**pilot_selection_id**: `pilot-2c-2026-07-12-02`
**sample_hash**: `ab6b0b19420c8cec`
**classifier_version**: `rules-1.0.0` / `rules_version`: `1.0.0`
**reviewer**: `ai-agent-blinded-v1` (baseline — **campos de risco exigem 2ª revisão humana**)
**Modo**: cego (só nome + grupo_muscular + ajustes + requires_load_logging; predições reveladas somente após reviewed_at).

---

## 1. Estado congelado (confirmações)

- `exercises`: 0 linhas com `metadata_reviewed_at`, `max(metadata_version)`=NULL.
- `exercise_metadata_suggestions` do run 793c8800: **30/30 pending** — nenhuma aprovada, nenhuma rejeitada, `proposed_metadata`/`field_confidence`/`matched_rules`/`reasoning`/`warnings` intactos.
- Nenhuma sugestão criada fora do run.
- Nenhuma chamada a `trainer-agent`, `approve_exercise_metadata_suggestion` ou `reject_exercise_metadata_suggestion`.
- Snapshot original preservado em `.lovable/pilots/pilot-2c-run-793c8800.json`.

## 2. Estrutura de Ground Truth

Nova tabela `public.exercise_metadata_ground_truth` (migração aplicada) — separada de `exercises`:

- `reviewed_metadata` jsonb, `field_review_status` jsonb, `field_notes` jsonb, `evidence` jsonb
- `review_version`, `comparison_revealed_at`, `adjudication_changes` jsonb[]
- Índice único parcial em `(exercise_id, classifier_run_id) WHERE status <> 'superseded'`
- Status: `draft` / `reviewed` / `adjudicated` / `finalized` / `superseded`
- RLS admin-only (SELECT / INSERT / UPDATE)

30 registros com `status='reviewed'` inseridos no run em questão.

## 3. Estados por campo — semântica corrigida

- `predicted`: classificador produziu valor
- `unresolved`: classificador tentou e não resolveu (`unresolvedFields`)
- `not_evaluated`: campo sem regra no classificador (**secondary_muscles: 30/30**, contraindications: 30/30)
- `not_applicable`: campo não se aplica (revisor)
- `abstention_total`: confidence=0, matched_rules=[] → **abstenção**, não erro de baixa confiança (aplica-se a CORDA NAVAL (BI), GÊMEOS UNILATERAL, HIPEREXTENSÃO LOMBAR 2)

## 4. Métricas por campo (n=30)

| campo | appl | pred | ✓ | ~ | ✗ | unn_abst | cor_abst | pred_NA | not_eval | avg_conf_ok | avg_conf_err | err≥0.90 | err≥0.80 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| movement_pattern | 30 | 13 | 12 | 0 | **1** | 17 | 0 | 0 | 0 | 0.90 | 0.88 | **0** | **1** |
| exercise_class | 30 | 17 | 17 | 0 | 0 | 13 | 0 | 0 | 0 | 0.88 | — | 0 | 0 |
| equipment_type | 27 | 11 | 8 | 0 | **3** | 16 | 0 | 0 | 0 | 0.91 | 0.90 | **3** | **3** |
| stability_level | 30 | 2 | 1 | 0 | 1 | 28 | 0 | 0 | 0 | 0.80 | 0.80 | 0 | 1 |
| technical_complexity | 30 | 2 | 2 | 0 | 0 | 28 | 0 | 0 | 0 | 0.75 | — | 0 | 0 |
| axial_load | 30 | 2 | 2 | 0 | 0 | 28 | 0 | 0 | 0 | 0.85 | — | 0 | 0 |
| lumbar_load | 30 | 2 | 2 | 0 | 0 | 28 | 0 | 0 | 0 | 0.75 | — | 0 | 0 |
| balance_requirement | 30 | 2 | 1 | 0 | 1 | 28 | 0 | 0 | 0 | 0.85 | 0.85 | 0 | 1 |
| fatigue_cost | 30 | 2 | 2 | 0 | 0 | 28 | 0 | 0 | 0 | 0.70 | — | 0 | 0 |
| safe_to_failure | 24 | 2 | 2 | 0 | 0 | 22 | **6** | 0 | 0 | 0.75 | — | 0 | 0 |
| primary_muscles | 30 | 18 | 9 | 7 | **2** | 12 | 0 | 0 | 0 | 0.85 | 0.85 | 0 | **2** |
| secondary_muscles | 30 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **30** | — | — | 0 | 0 |
| contraindications | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | 0 | — | — | 0 | 0 |

**Arrays (micro)**: `primary_muscles` P=0.84 R=0.55 F1=0.67; `secondary_muscles` sem previsões; `contraindications` sem previsões.
**safe_to_failure**: TP=2 · TN=0 · FP=0 · FN=0 · N/A(gt)=6 · unnecessary_abstention=22.

## 5. Matriz de confusão (só desvios)

- `movement_pattern`: `horizontal_push` ← gt `knee_flexion` × 1 (**FLEXÃO NÓRDICA**)
- `equipment_type`: `dumbbell` ← gt `free_weight` × 2 · `machine` ← gt `smith_machine` × 1
- `stability_level`: `high` ← gt `moderate` × 1 (**REMADA UNIL. POLIA**)
- `balance_requirement`: `none` ← gt `low` × 1 (**REMADA UNIL. POLIA**)
- `primary_muscles`: `[abs]` ← gt `[core, abdominals]` (**PRANCHA FRONTAL**) · `[chest]` ← gt `[thoracic_spine]` (**MOBILIDADE TORÁCICA**)

## 6. Erros de alta confiança (prioridade máxima para rules-1.0.1)

| exercício | campo | pred (conf) | gt | causa provável |
|---|---|---|---|---|
| FLEXÃO NÓRDICA | movement_pattern | `horizontal_push` (0.88) | `knee_flexion` | token isolado **"flexão"** → regra `flexão*` genérica de supino/flexão de braço |
| SUPINO RETO HALTERES | equipment_type | `dumbbell` (0.90) | `free_weight` | vocabulário divergente (dumbbell é subtipo de free_weight) — **candidato a adjudicação em favor da previsão** |
| STIFF HALTERES | equipment_type | `dumbbell` (0.90) | `free_weight` | mesma causa |
| SUPINO RETO SMITH | equipment_type | `machine` (0.90) | `smith_machine` | regra genérica não distingue Smith — **classificador ambíguo, corrigir para smith_machine** |
| PRANCHA FRONTAL | primary_muscles | `[abs]` (0.85) | `[core, abdominals]` | vocabulário: `abs` vs `abdominals` — **normalizar aliases** |
| MOBILIDADE TORÁCICA | primary_muscles | `[chest]` (0.85) | `[thoracic_spine]` | classificador mapeou por `grupo_muscular=PEITORAL` sem considerar `MOBILIDADE` no nome |

## 7. Abstenções desnecessárias mais críticas

- `equipment_type`: 16 abstenções em exercícios óbvios (MESA FLEXORA, TRÍCEPS CORDA, BICEPS CORDA, CROSS OVER, ELEVAÇÃO FRONTAL POLIA, CADEIRA ABDUTORA, FLY MACHINE, PUXADA ALTA NEUTRA, REMADA MÁQUINA, LEG PRESS, PALLOF PRESS NA POLIA, CADEIRA EXTENSORA já resolveu; total ≈16) — **falta regra para `polia`/`corda`/`cadeira`/`máquina` em grupos não-quadríceps**.
- `movement_pattern`: 17 abstenções (BÚLGARO, PRANCHA FRONTAL, BICEPS CORDA, LEG PRESS, KICK BACK, STIFF HALTERES, SALTO LATERAL, PALLOF PRESS NA POLIA, PESO MORTO, GOOD MORNING, HIPEREXTENSÃO LOMBAR 2, CORDA NAVAL, PASSADEIRA, GÊMEOS UNILATERAL, MOBILIDADE 3, MOBILIDADE TORÁCICA).
- `stability_level`, `technical_complexity`, `axial_load`, `lumbar_load`, `balance_requirement`, `fatigue_cost`: só 2/30 previstos — **conservadorismo correto por design**; **não expandir** sem evidência.
- `safe_to_failure`: 22 abstenções desnecessárias em máquinas isoladoras óbvias.

## 8. Análise de causas

| causa | ocorrências |
|---|---|
| substring incorreta (token isolado disparando regra genérica) | FLEXÃO NÓRDICA (`flexão`) |
| conflito frase-completa × palavra isolada | MOBILIDADE TORÁCICA (grupo=PEITORAL) |
| aliases ausentes / vocabulário divergente | PRANCHA FRONTAL (`abs`↔`abdominals`), SUPINO SMITH (`machine`↔`smith_machine`), free_weight↔dumbbell |
| regra excessivamente ampla | supino/flexão genérica batendo em flexão-de-perna |
| campo sem suporte no classificador | secondary_muscles (0/30), contraindications (0/30) |
| grupo muscular sem mapeamento | LOMBAR (nenhuma regra em HIPEREXTENSÃO LOMBAR 2), GASTROCNEMIUS (GÊMEOS UNILATERAL sem alias para panturrilha), CARDIO (CORDA NAVAL sem cobertura) |
| ambiguidade legítima de nome | BÚLGARO, KICK BACK, GÊMEOS UNILATERAL sem `equipment_type` — abstenção **correta** |

**FLEXÃO NÓRDICA — NÃO corrigir o run original.** Erro registrado; correção só em `rules-1.0.1`.

## 9. Métricas por tipo de exercício

| segmento | n | acertos exatos | erros | notas |
|---|---:|---:|---:|---|
| máquina isoladora (CAD.EXT, MESA FLEX, CAD.ABD, FLY MACHINE) | 4 | alta cobertura em class/movement/muscles; abstém em stability/etc | 0 | comportamento ideal |
| máquina composta (LEG PRESS, REMADA MÁQ, SUPINO SMITH) | 3 | class/muscles ok | 1 (SMITH) | expandir `smith_machine` |
| cabo isolador (TRÍC.CORDA, BÍC.CORDA, CROSS OVER, ELEV.FRONTAL POLIA) | 4 | class/movement/muscles ok | 0 | ok |
| cabo composto (REMADA UNIL. POLIA, PUXADA ALTA NEUTRA, PALLOF) | 3 | class ok | 2 (stability, balance em REMADA UNIL.) | corrigir para unilateral |
| pesos livres (SUP.HALT, STIFF HALT, AGACH., PESO MORTO, GOOD MORNING) | 5 | class/muscles ok | 2 (dumbbell↔free_weight) | vocab |
| peso corporal / pliometria (PRANCHA, BÚLGARO, SALTO LATERAL, FLEXÃO NÓRDICA) | 4 | parcial | **2 críticos** (nordica movement, prancha muscles) | maior risco de erro |
| cardio (PASSADEIRA, CORDA NAVAL) | 2 | ambos abstenção total (conf=0) | 0 | criar regras cardio |
| mobilidade (MOB QUADRIL 3, MOB TORÁCICA) | 2 | parcial | 1 (mobilidade torácica → chest) | tratar `MOBILIDADE` como prefixo |
| core (PALLOF PRESS) | 1 | class=core ok | 0 | ok |
| lombar (HIPEREXT LOMBAR 2) | 1 | abstenção total | 0 | criar regra para grupo LOMBAR |
| panturrilha (GÊMEOS UNIL.) | 1 | abstenção total | 0 | criar alias GASTROCNEMIUS→calves |

Ambiguidade **alta** (n=1 KICK BACK) → previsão parcial correta (glúteo). Ambiguidade **moderada** (n=10) → mistura de acertos parciais e abstenções — comportamento aceitável.

## 10. Adjudicações candidatas (2ª revisão)

Alterações no GT sugeridas pela comparação, a validar pelo administrador:

1. **SUPINO RETO HALTERES.equipment_type**: `free_weight` → `dumbbell` (mais específico; previsão do classificador é mais informativa).
2. **STIFF HALTERES.equipment_type**: `free_weight` → `dumbbell` (mesmo motivo).
3. **PRANCHA FRONTAL.primary_muscles**: `[core, abdominals]` → decidir vocabulário canônico (`abs` vs `abdominals`) — **não é erro do classificador se for vocab preferido**.

Qualquer aceitação registrará `adjudication_changes` com `from`/`to`/`reason` e `adjudicated_at`.

## 11. Proposta rules-1.0.1 (**NÃO IMPLEMENTAR AINDA**)

Prioridade:

1. **Fix regra `flexão`**: exigir contexto (palavra vizinha ou grupo) — não disparar `horizontal_push` quando grupo_muscular ∈ {ISQUIOTIBIAIS, POSTERIORES}. Prioridade máxima (único erro conf≥0.80 em movement_pattern).
2. **`SUPINO ... SMITH` → `smith_machine`** (não `machine`).
3. **Aliases de músculo canônico**: `abs`↔`abdominals`, `gastrocnemius`↔`calves`, `thoracic_spine` para nomes começando com `MOBILIDADE TORÁCICA`.
4. **Prefixo `MOBILIDADE ...`** → `exercise_class=mobility` + evitar mapear grupo_muscular como primary.
5. **Grupo LOMBAR** → mapear `movement_pattern=back_extension`, `primary_muscles=[erector_spinae]`.
6. **Cardio** (CORDA NAVAL, PASSADEIRA) → `exercise_class=cardio`, `safe_to_failure=not_applicable`.
7. **equipment_type nominal**: expandir cobertura em nomes com `POLIA/CORDA/CABO`, `MÁQUINA/CADEIRA/MESA`, `SMITH`, `HALTERES→dumbbell`, `BARRA→barbell`, `PESO CORPORAL→bodyweight`.
8. **Não expandir cobertura** de `stability_level`/`technical_complexity`/`axial_load`/`lumbar_load`/`balance_requirement`/`fatigue_cost`/`safe_to_failure` sem evidência de erro nas atuais — o conservadorismo funcionou.
9. **secondary_muscles**: sem regras hoje. Antes de adicionar, definir vocabulário.

## 12. Entregas finais

- Migração aplicada: `exercise_metadata_ground_truth` (RLS admin-only).
- 30 registros em `exercise_metadata_ground_truth` (status `reviewed`).
- Snapshot da revisão: `/tmp/gt/gt.json`.
- Tabela de comparação por exercício (13 campos × 30): `/tmp/gt/per_exercise.txt`.
- Relatório: este arquivo.

## 13. O que NÃO foi feito (conforme instrução)

- Nenhuma aprovação/rejeição de sugestão.
- Nenhum `UPDATE` em `exercises` (0 reviewed, versão NULL).
- Nenhuma execução nova de `classify_one` / `classify_group` / `classify_unclassified`.
- Nenhuma alteração no classificador (regra da FLEXÃO NÓRDICA preservada com erro registrado).
- Nenhuma alteração no `trainer-agent` ou nos planos.
- Aguardo autorização para: (a) segunda revisão humana dos campos de risco, (b) adjudicações candidatas, (c) implementar `rules-1.0.1` num run separado, (d) só então decidir sobre aprovação das sugestões.
