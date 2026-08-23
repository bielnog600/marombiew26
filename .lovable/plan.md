# Plan for Surgical AI Routing Hardening and Dependency Fixes

This plan implements critical fixes for AI routing logic, structured prompts, and dependency management while preserving the functional architectural restoration from the reference head.

## Technical Details

### 1. AI Routing Logic (Agents & Shared)
- **Shared Router (`supabase/functions/_shared/aiModelRouter.ts`):**
    - Implement `invariant` error in `createRoutingMetadata([])`.
    - Fix usage tracking: Ensure missing usage fields resolve to `null` instead of `0`.
    - Remove model downgrade: `callAI` will now send the exact model requested.
- **Diet Agent (`supabase/functions/diet-agent/index.ts`):**
    - **Update Fallback Constraints:** Prohibit Terra fallback for variation issues (similarity, portion overlap, source repetition) if `intent === 'update'`.
    - **Unified Pipeline:** Remove early returns for technical fallbacks. Ensure all model outputs (Luna or Terra) pass through parsing, nutrition validation, daily adjustments normalization/validation, and similarity checks.
    - **Strict Validity:** A Terra candidate is only accepted if `criticalValid` is true (valid nutrition AND valid daily adjustments if required). Return `422 review_required` if Terra remains invalid.
    - **Metadata/Error Handling:** Ensure 422 responses include full metadata (error_code, validationReasons, aiRouting, aiUsage). Remove `raw` from `invalid_json` responses.
    - **Absolute Limit:** Maximum of 2 model calls (Luna then optional Terra). No third call in any branch.
    - **Legacy Support:** Ensure legacy/streaming paths explicitly use `model: "gpt-4o"`.
- **Trainer Agent (`supabase/functions/trainer-agent/index.ts`):**
    - **Real Similarity:** Compute real workout similarity for technical fallbacks instead of using a hardcoded `0`.
    - **Redundancy Checks:** Ensure all fallback candidates pass through redundancy validation.
    - **Catalog Integration:** Move critical catalog matching into the candidate evaluation phase. Use clones to avoid mutation side effects during evaluation.
    - **Final Validation:** Hard reject if Terra remains redundant or has critical catalog mismatches.
    - **Metadata/Error Handling:** When at least one Luna/Terra attempt has occurred, errors (422, 502, etc.) must include metadata (error_code, validationReasons, aiRouting, aiUsage). Never return raw model output, prompts, or PII.
    - **Absolute Limit:** Maximum of 2 model calls. No third call in any branch.
    - **Legacy Support:** Ensure legacy/streaming paths explicitly use `model: "gpt-4o"`.

### 2. Structured Prompts
- **Refinement:**
    - Refine prompt construction for `outputMode === 'json'`.
    - Explicitly exclude conversational elements (WhatsApp, "ask questions", "one at a time"), markdown tables, and textual justifications from the structured core.
    - Preserve all technical rules, safety constraints, and specific planning logic (split, catalog, periodization, nutrition rules, weeklyEnergySchedule, dailyAdjustments, intent).

### 3. Dependency Alignment
- **Verification:** Check versions in current HEAD before changing `package.json`.
- **Action:** If incompatible, pin `vitest` and `@vitest/coverage-v8` to `3.2.7`.
- **Constraint:** Do NOT alter Vite version. Do NOT use `--force` or `--legacy-peer-deps`.

### 4. Testing & Validation
- **New Tests:** Create `supabase/functions/tests/ai-routing-logic.test.ts` to verify routing decisions, fallback triggers, and metadata generation without calling the live OpenAI API.
- **Structured Prompt Tests:** Explicitly verify structured prompts lack conversational/markdown instructions while preserving technical constraints.
- **Call Budget Tests:** Verify max 2 calls per request for both diet and trainer agents.
- **Specific Coverage:**
    - Router: 1 vs 2 calls, invariant on empty attempts, usage null handling, exact model sending.
    - Diet: Update constraints, invalid_json/nutrition/dailyAdj fallbacks, technical fallback validation, 422 on Terra failure.
    - Trainer: Similarity calculation, exact duplicate handling, catalog mismatch handling, no "invented" scores.
    - Legacy: Model gpt-4o confirmation.
- **Integrity Checks:** `deno check` on agents/shared, `deno test`, `npm test`, `npm run build`.

## User Review Required
> [!IMPORTANT]
> This plan assumes the environment allows outgoing calls to the official OpenAI API as previously configured. No changes to API keys or secrets are included in this turn.
