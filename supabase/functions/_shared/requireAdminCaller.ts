// Guarda das funções de IA de prescrição: só admin logado (JWT + has_role 'admin') ou chamada
// interna servidor→servidor com a service role. Qualquer outro caso responde 401/403 ANTES de
// ler o corpo ou chamar a IA.
import { authorizePrivilegedRequest } from "./authorizePrivilegedRequest.ts";

const MESSAGES: Record<string, string> = {
  missing_authorization: "Faça login para usar a IA.",
  invalid_token: "Sessão expirada. Entre de novo para usar a IA.",
  admin_role_required: "Só o admin pode usar a IA de prescrição.",
  method_not_allowed: "Método não permitido.",
};

export async function requireAdminCaller(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const r = await authorizePrivilegedRequest(req);
  if (r.ok) return null;
  return new Response(JSON.stringify({ error: MESSAGES[r.error] ?? r.error, code: r.error }), {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
