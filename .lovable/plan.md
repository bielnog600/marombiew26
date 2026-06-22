# Variabilidade controlada de planos (treino + dieta)

## Objetivo

Reduzir a sensação de "plano reciclado" sem perder coerência técnica. IA gera planos mais variados quando apropriado, e o backend mede similaridade com o histórico antes de aceitar.

## Decisões já alinhadas

- Default de variação: **Média**
- Acima do limite: **regenerar 1x automaticamente**, depois alertar
- Escopo: **último + ponderado por idade** (decay: 1.0 / 0.6 / 0.3 nos 3 últimos)
- Métrica: **híbrida** — Jaccard determinístico como gate, IA-judge só quando passar do limite (pra justificar e guiar a 2ª tentativa)

## Arquitetura

```text
TreinoIA / DietaIA  ──> trainer-agent / diet-agent
                          │
                          ├─ carrega últimos 3 planos do aluno (RPC leve)
                          ├─ injeta resumo + regras de divergência no prompt
                          ├─ 1ª geração (JSON schema v2)
                          ├─ computeSimilarity(novo, histórico ponderado)
                          │     └─ se > threshold[intensidade]:
                          │           - chama IA-judge curta p/ apontar
                          │             quais blocos repetem
                          │           - regenera 1x com instruções extras
                          ├─ persiste plano + métricas (similarity_score,
                          │   regeneration_count, variation_intensity)
                          └─ retorna alerta soft se ainda > threshold
```

## Arquivos a criar

- `src/lib/planSimilarity.ts` — Jaccard ponderado por idade, normalização de nomes, score 0–1, breakdown por seção (exercícios principais vs acessórios; refeições vs alimentos).
- `src/lib/variationProfiles.ts` — thresholds e instruções de prompt por intensidade (baixa/média/alta), separado treino x dieta.
- `supabase/functions/_shared/planHistory.ts` — busca últimos N planos ativos do aluno (treino ou dieta), retorna resumo compacto pro prompt.
- `supabase/functions/_shared/similarityJudge.ts` — chamada curta à IA pra explicar repetições quando gate determinístico falha.

## Arquivos a alterar

- `supabase/functions/trainer-agent/index.ts`
  - aceita `variationIntensity` no input (default `media`)
  - carrega histórico via `planHistory`
  - injeta no system prompt: resumo dos últimos planos + regras de divergência (compostos podem manter, acessórios devem rotacionar ≥X%, variar rep ranges/técnicas/ordem)
  - após validar JSON, chama `computeWorkoutSimilarity`
  - se acima do limite → IA-judge → 2ª geração com instruções extras → recomputa
  - retorna `{ plan, similarity: { score, breakdown, regenerated, warning } }`
- `supabase/functions/diet-agent/index.ts`
  - mesmo padrão: variar alimentos, combinações, distribuição; manter macros/restrições/preferências
  - similaridade compara alimentos por refeição (não só lista flat)
- `supabase/functions/_shared/ai-gateway.ts` — se já não existir, sem mudança
- `src/pages/TreinoIA.tsx` e `src/pages/DietaIA.tsx`
  - selector de intensidade (baixa/média/alta) com default média
  - badge mostrando score de similaridade após geração; toast quando regenerou; alerta soft quando ainda alto
- `src/lib/workoutPlanRepo.ts` — persistir metadata opcional `{ similarity_score, variation_intensity, regenerated }` em coluna existente (`metadata` jsonb se houver) ou nas tabelas `*_versions`

## Métrica determinística (resumo)

**Treino** — para cada dia:
- normaliza nome do exercício (lowercase, remove variação, mapeia sinônimos via `exerciseMatcher` já existente)
- Jaccard entre conjuntos de exercícios + bônus quando rep range/técnica também coincide
- peso maior nos acessórios (compostos podem repetir), peso menor nos principais

**Dieta**:
- por refeição (café, almoço, etc.), Jaccard de alimentos normalizados
- bônus de divergência quando combinação (proteína+carbo+gordura) muda

**Score final**: média ponderada das seções × decay temporal do plano histórico (1.0, 0.6, 0.3).

**Thresholds**:
- baixa: aceita até 0.75
- média: aceita até 0.55
- alta: aceita até 0.35

## Tratamento de erro

- IA-judge falha → segue só com gate determinístico, regenera com instrução genérica
- 2ª geração falha validação → mantém 1ª (já é válida), marca `warning: 'high_similarity'`
- Histórico vazio (1º plano do aluno) → pula similaridade

## O que NÃO muda

- Schema v2 do `workoutSchema.ts` permanece igual
- Pipeline de persistência JSON-first (passos 1–3) intocado
- `migration_status`, `conteudo_json`, `fase` — sem alteração

## Validação

- Unit tests em `planSimilarity.ts` (casos: idêntico=1, totalmente diferente=0, parcial)
- Cenário manual: gerar 2 treinos seguidos pro mesmo aluno, confirmar score visível < threshold e exercícios efetivamente rotacionados
- Cenário manual dieta: idem
- 1º plano de aluno novo: confirma que pula gate sem erro
