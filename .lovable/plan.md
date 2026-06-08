# Persistência da Sessão Admin de Treino

## O que vamos construir

Hoje o `TrainerLogSheet` e o `DuoTrainerLogSheet` mantêm a sessão só em memória: o cronômetro reinicia quando fecha o modal, e o registro só vira `workout_session` no clique em "Finalizar". A proposta cria persistência real: a sessão é gravada no banco como `in_progress` assim que você inicia, o estado do formulário é salvo automaticamente e um banner global permite retomar/finalizar/cancelar mesmo após fechar o modal ou o app.

## Componentes a criar / mudar

1. **Contexto global `AdminTrainerSessionContext`** (`src/contexts/AdminTrainerSessionContext.tsx`)
   - Estado: `activeSession` (id, studentId(s), startedAtReal, mode 'individual'|'duo', dayName, phase, calendarEventIds, studentNames, planId).
   - Hidrata na montagem buscando `workout_sessions` `status='in_progress'` `source='admin'` mais recente do admin (por `paired_student_id` IS NULL/NOT NULL define modo). Como `workout_sessions` não tem coluna de admin, gravaremos o `admin_user_id` em `session_state` (ex.: `session_state.meta.admin_id`) e filtraremos por isso.
   - Métodos: `startSession({...})`, `openSheet()`, `closeSheet()` (= minimizar), `finishSession()`, `cancelSession()`, `updateSessionState(patch)` (debounced 1.5s → `UPDATE workout_sessions.session_state`).
   - Mantém o cronômetro derivado de `startedAtReal` (não acumulado em tick, evita drift quando o tab dorme).

2. **`AdminTrainerSessionBanner`** (`src/components/training/AdminTrainerSessionBanner.tsx`)
   - Renderiza um banner fixo no rodapé (acima do `BottomNav` no mobile, ou bottom-right no desktop) quando há sessão ativa e o modal está fechado.
   - Mostra: nome do(s) aluno(s), cronômetro ao vivo (recalc do tempo a cada 1s), botões `Retomar`, `Finalizar`, `Cancelar` (com confirmação).
   - Montado uma vez em `AppLayout` para admins.

3. **Refatorar `TrainerLogSheet`**
   - Remover criação local de `session` (sessionId aleatório / `linkOrCreateAgendaEventForSession` interno).
   - Receber a sessão ativa via contexto. Se ao abrir não existir, chama `startSession({ mode: 'individual', studentId, dayName, phase, planId })` antes de renderizar.
   - `startSession` faz: INSERT em `workout_sessions` com `status='in_progress'`, `source='admin'`, `executed_by='coach'`, `started_at`, `started_at_real`, `session_state={ meta:{ admin_id, student_names, day_name, phase, plan_id }, exercises: {} }`, e em seguida `linkOrCreateAgendaEventForSession`. Salva `calendar_event_id` na linha.
   - Autosave: cada `updateSet` / `updateNotes` / `saveExercise` empurra o estado serializado para `updateSessionState`, que faz debounce e `UPDATE workout_sessions SET session_state=$1 WHERE id=$2`.
   - Hidratação: ao montar, lê `session_state` do contexto e popula `state` (campos de carga/reps em andamento, savedSets, exerciseNames, notes). Cronômetro = `Date.now() - startedAtReal`.
   - X (fechar) apenas chama `closeSheet()`; não altera status nem timer.
   - "Finalizar Sessão" chama `finishSession()` do contexto (UPDATE status='completed', completed_at_real, duration, totals + `completeAgendaEventForSession`).
   - Nova ação "Cancelar Sessão" no header do sheet (UPDATE status='abandoned', sem concluir agenda).

4. **Refatorar `DuoTrainerLogSheet`**
   - Mesma lógica em modo `duo` com `paired_student_id`. `session_state` guarda os 2 sub-estados (A/B), nomes, dia ativo. Insere 1 linha `workout_sessions` (a do studentA) com `session_mode='duo'` e `paired_student_id`, e abre/conclui agenda para os 2 alunos como hoje. Banner mostra "A + B".

5. **Guardrail em `StudentTrainingTab`**
   - Antes de chamar `setTrainPlan(p)` ou abrir Duo, consulta `useAdminTrainerSession()`: se existir sessão ativa de OUTRO aluno, bloqueia com toast "Finalize ou cancele a sessão de [nome] antes de iniciar outra" + abre o banner.
   - Se a sessão ativa for do MESMO aluno, em vez de criar nova chama `openSheet()` (retomar).

## Schema

Nenhuma migração nova: `workout_sessions` já tem `status`, `started_at_real`, `completed_at_real`, `session_state` (jsonb), `source`, `executed_by`, `session_mode`, `paired_student_id`. Vamos só usar.

`session_state` shape:
```text
{
  meta: { admin_id, mode, day_name, phase, plan_id, students: [{ id, nome }] },
  individual: { activeDayIdx, exercises: { [idx]: { sets, notes, savedSets, exerciseName } } },
  duo: { A: {...}, B: {...} }
}
```

## Resumo das telas

- Clique em "Treinar" no admin: se já houver sessão ativa do mesmo aluno → reabre modal com estado restaurado. Se for de outro → bloqueia. Senão → inicia nova (DB + agenda) e abre modal.
- Modal X → fecha modal, sessão segue, banner aparece.
- Banner: "Treino em andamento — Suzane • 23:14" com [Retomar] [Finalizar] [Cancelar].
- Reabrir app → contexto carrega a sessão `in_progress` do admin, banner reaparece com cronômetro contínuo.

## Riscos / detalhes

- Cronômetro baseado em `startedAtReal` evita drift e funciona após reload.
- Autosave usa debounce + cancelamento no unmount para não sobrescrever atualização posterior.
- `linkOrCreateAgendaEventForSession` continua sendo chamado uma única vez no `startSession`.
- Finalizar/Cancelar limpa drafts locais (`localStorage`) das chaves usadas.
- Para detectar "sessão admin do usuário logado", filtramos `source='admin'` + `session_state->meta->>admin_id = auth.uid()`.
