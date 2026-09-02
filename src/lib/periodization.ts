/**
 * Camada de periodização — reexport da FONTE CANÔNICA.
 *
 * A lógica vive em `supabase/functions/_shared/periodization.ts` para que a
 * Edge Function e o frontend usem literalmente o MESMO código (sem drift,
 * sem duas implementações da mesma regra).
 */
export * from '../../supabase/functions/_shared/periodization';
