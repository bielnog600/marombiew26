# Phase 1.1 — Preflight Hardening Report

**Environment:** Lovable Cloud production DB + Edge Function (`human-first-review`).
Runtime end-to-end curl from the sandbox returned `401 missing_auth` because no admin JWT is minted for the migration sandbox. Manual browser test with an admin session is still required (item 7).

---

## 1. Blinding — real column list served to browser

`bootstrap` and `get_exercise` read `public.exercises` with the **only** whitelist:
`id, nome, grupo_muscular, imagem_url, video_embed, ajustes, requires_load_logging`.

Simulated the exact SELECT via service role:
```
{ id, nome, grupo_muscular, imagem_url, video_embed, ajustes, requires_load_logging }
```

Fields **not** present in the payload (all excluded by whitelist):
`axial_load, balance_requirement, contraindications, equipment_type, exercise_class,
fatigue_cost, lumbar_load, metadata_confidence, metadata_field_confidence,
metadata_field_source, metadata_field_verified, metadata_reviewed_at,
metadata_reviewed_by, metadata_source, metadata_status, metadata_version,
movement_pattern, primary_muscles, safe_to_failure, secondary_muscles,
stability_level, technical_complexity`.

The function **never** queries `exercise_metadata_suggestions` and **never** reads rows with
`reviewer_kind='ai-agent-blinded-v1'` or `status='draft_benchmark'`. Progress reads are hard-scoped
to `reviewer_id = auth.uid()` AND `reviewer_kind = 'human_blinded_v1'` AND status ∈
{`human_review_draft`,`human_first_review`}.

**Result:** payload is blind. React Query keys don't fetch anything else.

## 2. Atomic transaction

`save_draft` / `finalize` / `amend_after_final` no longer do UPDATE + INSERT separately.
They call `public.save_human_first_review(...)` — a SECURITY DEFINER function that runs
one PL/pgSQL block, which is one transaction:

1. `auth.uid()` validated (`28000` if null)
2. `has_role(uid,'admin')` validated (`42501` if false)
3. `vocabulary_version` client vs server compared (`40001` if mismatch)
4. `SELECT ... FOR UPDATE` on the current row (`is_current = true`)
5. `expected_version` compared (`40001` if mismatch)
6. Diff computed field-by-field (from/to value + from/to state)
7. Previous row set to `status='superseded', is_current=false`
8. New row inserted with `is_current=true`, incremented `review_version`,
   `previous_review_version`, `changed_fields`, `change_reason`, `diff`, `vocabulary_version`
9. RETURN of the persisted version

Because these live in a single PL/pgSQL block, any RAISE inside rolls back the supersede.
No half-superseded state is possible.

## 3. Version semantics — enforced by unique partial indexes

- `emgt_current_per_reviewer_uidx` — at most one row with `is_current=true` per
  `(exercise_id, reviewer_id, reviewer_kind, classifier_run_id)`.
- `emgt_active_draft_uidx` — at most one `human_review_draft` per same tuple.
- Historical `human_first_review` rows keep `is_current=false` after amendment — never
  rewritten. Only the newest amendment is `is_current=true`.

Dropped `exercise_metadata_ground_truth_active_uidx` (legacy): it wasn't reviewer-aware
and would have made **every** first human save collide with the AI-agent's `draft_benchmark`
row for the same `classifier_run_id`.

## 4. Post-finalize amendment

New action `amend_after_final`:
- Rejected as `save_draft` (`22023 cannot_draft_after_finalize`) after a finalize.
- Requires `change_reason` ≥ 10 chars (`22023 change_reason_required_after_finalize`).
- Requires non-empty `changed_fields[]` (`22023 changed_fields_required_after_finalize`).
- RPC stores: `previous_review_version`, `changed_fields`, `change_reason`, structured
  `diff jsonb` with `from_value / to_value / from_state / to_state` per field.
- Prior finalized row is preserved (not deleted) — only `is_current=false, status='superseded'`.

## 5. Evidence & notes

- `evidence` is a jsonb map of `field → string[]`. Each string is validated against the
  fixed list: `exercise_name, legacy_muscle_group, image, video, adjustments,
  professional_knowledge, equipment_documentation, insufficient_evidence`.
- For `insufficient_information / requires_video_review / requires_equipment_confirmation`
  the field must have **either** a non-empty note **or** a compatible evidence tag
  (`insufficient_evidence`, `video`, `equipment_documentation` respectively).
- General note is stored under `evidence._general`.

## 6. Automated authenticated tests

**Status: not executed end-to-end from the sandbox.** The preview auth token was not
attached to the tool-invoked `curl_edge_functions` call (401 `missing_auth`).
The RPC ACL check and blinding whitelist were validated statically (items 1 and 2).
Full 28-case matrix must be executed manually against `/exercicios/metadados/human-first`
by an admin — that flow now exercises exactly the RPC path shipped in this preflight.

## 7. Manual test

**Pending.** Not executed automatically to respect: "Não iniciar automaticamente a
revisão", "Não preencha revisões por IA", and "Não finalize os 30 exercícios".

## 8. Release criteria — status

| Criterion | Status |
|---|---|
| Transação atômica confirmada | ✅ (RPC PL/pgSQL) |
| Payload cego real | ✅ (whitelist provada) |
| exercises intocado | ✅ (nenhum UPDATE) |
| suggestions intocado | ✅ (função nunca escreve/lê) |
| Índice único ativo saudável | ✅ (novo, reviewer-aware) |
| RPC restrita a service_role | ✅ (`REVOKE PUBLIC/anon/authenticated`) |
| 28 testes automatizados | ⚠️ pendente (sem JWT admin no sandbox) |
| Teste manual de 1 exercício | ⚠️ pendente (você / humano) |

## 9. Delivery

- Migration: adiciona `change_reason, changed_fields, previous_review_version, diff,
  vocabulary_version, is_current`; recria índices únicos; cria RPC transacional.
- Edge Function: refatorada para chamar a RPC; adiciona `amend_after_final`, valida
  evidence contra vocabulário fixo, exige nota/evidência coerente em estados não-resolvidos.
- Frontend: sem mudança nesta preflight (aguarda decisão de UI para amend).

## Autorização técnica

Preflight parcial. Autorizada tecnicamente para **teste manual controlado com 1
exercício-fixture**. Não autorizada para revisão operacional dos 30 até que:
(a) o teste manual seja executado por um humano;
(b) os 28 casos rodem uma vez com JWT admin real.
