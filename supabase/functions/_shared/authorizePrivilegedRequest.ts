// Autorização compartilhada para Edge Functions privilegiadas (service role).
// Distingue explicitamente:
//   - "internal": chamada server-to-server usando SUPABASE_SERVICE_ROLE_KEY (não disponível ao browser)
//   - "admin":    usuário real autenticado com role 'admin'
// Qualquer outro caso => 401/403. Nada de service role antes de autorizar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthorizedCaller =
  | { kind: "internal" }
  | { kind: "admin"; userId: string };

export type AuthorizationResult =
  | { ok: true; caller: AuthorizedCaller }
  | { ok: false; status: 401 | 403 | 405; error: string };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Autoriza a request ANTES de qualquer leitura/escrita privilegiada.
 * `allowedMethods` default: apenas POST (OPTIONS deve ser tratado antes, no CORS).
 */
export async function authorizePrivilegedRequest(
  req: Request,
  opts: { allowedMethods?: string[] } = {},
): Promise<AuthorizationResult> {
  const allowed = opts.allowedMethods ?? ["POST"];
  if (!allowed.includes(req.method)) {
    return { ok: false, status: 405, error: "method_not_allowed" };
  }

  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "missing_authorization" };

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceRole && timingSafeEqual(token, serviceRole)) {
    return { ok: true, caller: { kind: "internal" } };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "";

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await authClient.auth.getUser();
  const user = data?.user;
  if (error || !user) return { ok: false, status: 401, error: "invalid_token" };

  // Verificação de role com o próprio JWT do usuário (has_role é SECURITY DEFINER).
  const { data: isAdmin, error: roleError } = await authClient.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) {
    return { ok: false, status: 403, error: "admin_role_required" };
  }

  return { ok: true, caller: { kind: "admin", userId: user.id } };
}

export function unauthorizedResponse(
  result: Extract<AuthorizationResult, { ok: false }>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: result.error }), {
    status: result.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
