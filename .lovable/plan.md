## Objetivo

Adicionar um terceiro modo de séries (`per_set` — "Repetições por série") aos planos de treino, mantendo intactos os modos atuais (`uniform` e `recognition_work`), sem migration, com retrocompatibilidade total do markdown de 9 colunas.

## Contrato estruturado (em `conteudo_json`)

Adicionar campo opcional `set_scheme` em `WorkoutExerciseSchema`:

```
set_scheme?: {
  mode: 'uniform' | 'recognition_work' | 'per_set',
  sets?: Array<{
    set_number: number,
    set_type: 'work' | 'recognition',
    target_reps: string   // "12", "8-10", "AMRAP", "falha"
  }>
}
```

Sem `set_scheme` → comportamento atual permanece. Sem migration.

## Arquivos alterados

**Schema/tipos**
- `src/lib/workoutSchema.ts` — adicionar `SetSchemeSchema` opcional em `WorkoutExerciseSchema`; `normalizeWorkoutPlan` preserva o campo.

**Serialização/parsing markdown**
- `src/lib/workoutMarkdownSerializer.ts` — para `per_set`, `SÉRIE = N` e `REPETIÇÕES = "12 / 10 / 6"`; demais modos inalterados.
- `src/lib/trainingResultParser.ts` — detectar `X / Y / Z` em REPETIÇÕES e gerar `set_scheme.mode='per_set'` durante ingestão do markdown quando não houver JSON.
- `src/lib/setPlanBuilder.ts` — `buildSetPlan` aceita `setScheme?` e prioriza-o sobre `series/series2/reps` quando presente.

**Editor manual (Admin → Alunos → Treinos e wizard IA)**
- `src/pages/TreinoIA.tsx` — no editor de exercício, seletor de modo (Padrão / Reconhecimento+Trabalho / Repetições por série). No modo `per_set`, renderizar lista `Série N | Repetições [_]` com botões Adicionar/Remover série. Ao alternar modo, converter valores existentes quando possível. Bloquear salvamento se `sets.length !== series` ou algum `target_reps` vazio, com mensagem "Defina as repetições das N séries."
- `src/pages/TreinoPreview.tsx` — mostrar reps por série quando `per_set`.

**IA (geração e edição)**
- `supabase/functions/trainer-agent/index.ts` — expor `set_scheme` no JSON schema estruturado + instruir a IA quando usar `per_set` (pirâmides, top-set + back-off, etc.). Não obrigatório; default continua `uniform`. Validar servidor: `sets.length === series`, `set_number` sequencial, sem duplicatas, `target_reps` não vazio, sem zero/negativo.
- `supabase/functions/training-edit-agent/index.ts` — aceitar/retornar `set_scheme`; preservar quando o pedido não envolver séries.

**Execução (Modo Treino)**
- `src/components/training/TrainerLogSheet.tsx` — quando exercício tem `set_scheme.mode === 'per_set'`, renderizar uma linha por série com `Meta: X repetições`, campos Carga / Repetições realizadas / Concluído. Prescrição imutável para o aluno. Draft (localStorage) por série via `set_number`.
- `src/components/training/TrainerLogSheetUtils.ts` — `buildSetPlan` recebe `setScheme` para expandir metas por série; `makeDaySignature` inclui hash do `set_scheme`.
- `src/pages/TreinoExecucao.tsx` — passar `set_scheme` para o log sheet.

**Testes**
- `src/test/setSchemePerSet.test.ts` (novo) — cobre: uniform preservado, recognition_work preservado, `per_set` roundtrip JSON→markdown→JSON (`12 / 10 / 6`), plano antigo sem `set_scheme` normalizado, validação bloqueando `sets.length !== series` e `target_reps` vazio.

## Retrocompatibilidade

1. Planos sem `set_scheme` → tratados como `uniform` implícito (comportamento atual, zero mudança visível).
2. Modo `recognition_work` continua usando `series/series2/reps` como hoje; `set_scheme` é opcional e espelha, não substitui.
3. Markdown mantém 9 colunas. `"12 / 10 / 6"` na coluna REPETIÇÕES é o único sinal do per_set no fallback textual.
4. `conteudo_json` é fonte preferencial; markdown continua fallback.

## Testes finais

Executar:
- `bunx tsgo --noEmit`
- `bunx vitest run src/test/setSchemePerSet.test.ts src/test/workoutPlanMigration.test.ts`
- `bun run build`

## Fora do escopo

Métodos, progressão, RIR, pausa, periodização, dietas, banco de exercícios, publicação, histórico. Sem migration DB.

Aguardando aprovação para implementar.