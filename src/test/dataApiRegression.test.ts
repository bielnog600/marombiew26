// Regression guard for Data API health.
// Detects, without triggering any automatic restart:
//   - HTTP 503 responses from PostgREST
//   - PGRST002 (schema cache) errors
//   - PGRST003 (statement/pool timeout) errors
// Intended to be run manually or in CI against the deployed backend.
// Never invokes supabase--restart or any privileged operation.

import { describe, it, expect } from "vitest";

const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ??
  "https://plqdoweunmpnlzvtisnn.supabase.co";
const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWRvd2V1bm1wbmx6dnRpc25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTE4ODcsImV4cCI6MjA4Nzc4Nzg4N30.Rsjtf9P0IDuAbN9OF2h75MTOTdoCIi7m6INMC8OBtwI";

const PROBE_TABLES = ["user_roles", "assessments", "profiles"] as const;
const PGRST_ERROR_CODES = ["PGRST002", "PGRST003"] as const;

async function probeTable(table: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=*`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "count=exact",
        Range: "0-0",
      },
    }
  );
  let bodyText = "";
  try { bodyText = await res.text(); } catch { /* noop */ }
  let code: string | undefined;
  try { code = bodyText ? JSON.parse(bodyText)?.code : undefined; } catch { /* noop */ }
  return { status: res.status, code, body: bodyText.slice(0, 400) };
}

describe("Data API regression guard", () => {
  // Explicit opt-in — do not fail local unit runs against unrelated envs.
  const enabled = process.env.RUN_DATA_API_REGRESSION === "1";
  const testOrSkip = enabled ? it : it.skip;

  for (const table of PROBE_TABLES) {
    testOrSkip(`GET /rest/v1/${table} must not return 503 / PGRST002 / PGRST003`, async () => {
      const { status, code, body } = await probeTable(table);
      // Fail explicitly on the known infrastructure signatures.
      expect(
        status,
        `HTTP 503 detected on ${table} — Data API unhealthy. Body: ${body}`
      ).not.toBe(503);
      expect(
        PGRST_ERROR_CODES.includes(code as any) ? code : undefined,
        `PostgREST error ${code} on ${table} — request manual investigation. NO automatic restart. Body: ${body}`
      ).toBeUndefined();
      // Anything under 500 is acceptable here (auth-driven 401/403 are OK for anon).
      expect(status).toBeLessThan(500);
    }, 15_000);
  }
});

// Exported so it can be reused by an operational health check page/script
// without triggering restarts.
export const dataApiRegression = { probeTable, PROBE_TABLES, PGRST_ERROR_CODES };