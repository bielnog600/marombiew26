## Objetivo

Adicionar um terceiro modo de séries — **Repetições por série (`per_set`)** — em paralelo aos modos existentes (Padrão e Reconhecimento + Trabalho), sem alterar comportamento atual, sem migration, sem coluna nova no markdown, e sem quebrar planos antigos.

## Estratégia — Contrato

Novo campo opcional `setScheme` em `WorkoutExercise` (e mirror opcional em `ParsedExercise`):

```ts
setScheme?: {
  mode: 'uniform' | 'recognition_work' | 'per_set';
  sets: Array<{
    set_number: number;
    set_type: 'work' | 'recognition';
    target_reps: string; // "12", "8-10", "AMRAP", "falha"
  }>;
}
```

- `setScheme` é a fonte de verdade estruturada quando presente.
- Campos legados `series` / `series2` / `reps` continuam preenchidos (retrocompatibilidade e markdown).
- Ausência de `setScheme` = comportamento atual inalterado.

## Serialização Markdown (retrocompatível — 9 colunas)

Para `mode = per_set`:
- Coluna SÉRIE = número total de séries (ex: `3`)
- Coluna SÉRIE 2 = `-`
- Coluna REPETIÇÕES = `12 / 10 / 6`

Parser: quando `reps` contém `/` e o número de partes bate com `series`, gera `setScheme.mode = per_set` na leitura.

## Arquivos a alterar

**Contrato/lib (retrocompatível):**
- `src/lib/workoutSchema.ts` — adicionar `setSchemeSchema` opcional em `WorkoutExerciseSchema` e propagar no `normalizeWorkoutPlan` / `parsedDaysToWorkoutPlan`.
- `src/lib/trainingResultParser.ts` — adicionar `setScheme?` a `ParsedExercise`; detectar padrão `"a / b / c"` em reps.
- `src/lib/workoutMarkdownSerializer.ts` — emitir `X / Y / Z` quando `per_set`.
- Atualizar `rebuildTrainingMarkdown` da mesma forma.
- `src/lib/setPlanBuilder.ts` — priorizar `setScheme` no `buildSetPlan`.
- `src/components/training/TrainerLogSheetUtils.ts` — mesma priorização no `buildSetPlan` do log.

**Editor:**
- `src/components/training/TrainingDayCard.tsx` — terceira opção "Repetições por série" no seletor `StructureMode`; lista editável de séries (adicionar/remover), sincronizar com `series` e `reps` legados; validar antes do `commitEdits`.

**Modo Treino:**
- `src/components/training/TrainerLogSheet.tsx` — passar `ex.setScheme` para `buildSetPlan`; UI já suporta targetReps por série (só passa a exibir metas distintas).

**IA:**
- `supabase/functions/trainer-agent/index.ts` — adicionar `set_scheme` opcional ao JSON schema + parágrafo de uso (pirâmide, top-set etc.).
- `supabase/functions/training-edit-agent/index.ts` — mesma adição; preservar `set_scheme` quando não houver pedido de alteração.

**Testes:**
- `src/test/workoutSetScheme.test.ts` (novo):
  - A. Padrão retro (sem setScheme)
  - B. Reconhecimento + Trabalho retro
  - C. per_set: expandido para 3 metas distintas
  - D. Serializar per_set → parse round-trip
  - E. Validação: número de séries diferente do array bloqueia
  - F. Plano antigo sem `setScheme` continua abrindo
- `bunx tsgo --noEmit` + `bun run build` + `bunx vitest run`

## Não alterar

PDF, execução de outros modos, banco de exercícios, agentes de dieta, políticas de publicação, histórico do aluno.

## Riscos

- `TrainingDayCard` já é complexo — vou manter as funções existentes intactas e apenas adicionar `setPerSetMode`, `updatePerSetReps`, `addPerSetSlot`, `removePerSetSlot` e um bloco de UI dedicado.
- Mudança no schema é aditiva; planos antigos permanecem válidos porque `setScheme` é `.optional()`.

Confirma para eu implementar?