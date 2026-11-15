import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireAdminCaller } from "../_shared/requireAdminCaller.ts";

const cors = { "Access-Control-Allow-Origin": "*" };
const req = (headers: Record<string, string>) => new Request("http://x/cardio-agent", { method: "POST", headers, body: "{}" });

Deno.test("sem login responde 401 antes da IA", async () => {
  const r = await requireAdminCaller(req({}), cors);
  assertEquals(r?.status, 401);
  assertEquals((await r!.json()).code, "missing_authorization");
});

Deno.test("método diferente de POST responde 405", async () => {
  const r = await requireAdminCaller(new Request("http://x", { method: "GET" }), cors);
  assertEquals(r?.status, 405);
});

Deno.test("chamada interna com a service role passa", async () => {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return; // ambiente sem a chave: o caso interno não é testável aqui
  const r = await requireAdminCaller(req({ Authorization: `Bearer ${key}` }), cors);
  assertEquals(r, null);
});
