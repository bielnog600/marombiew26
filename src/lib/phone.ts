/**
 * Normaliza telefone para uso no WhatsApp (formato E.164 sem "+").
 *
 * Regras:
 * - Se o número já vier com "+" (ex: +1 312 714 8872, +351 ...), respeita o
 *   código do país informado e NÃO adiciona 55.
 * - Se vier com "00" internacional, converte para o formato sem prefixo.
 * - Só assume Brasil (55) para números locais de 10/11 dígitos.
 * - Só assume Portugal (351) para números locais de 9 dígitos.
 * - Qualquer outro tamanho é mantido como está (outros países).
 */
export function normalizeWhatsAppPhone(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  // Já internacional explicitamente
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);

  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.startsWith('351') && digits.length >= 12) return digits;

  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 9) return `351${digits}`;

  return digits;
}
