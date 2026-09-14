/**
 * nutritionEngine — ÚNICA autoridade de cálculo nutricional do app.
 *
 * A matemática vive em `supabase/functions/_shared/nutritionCore.ts` para que o
 * app e o `diet-agent` compartilhem exatamente a mesma implementação (Fase 4).
 * Não duplicar fórmulas: qualquer ajuste é feito no núcleo compartilhado.
 */
export * from '../../supabase/functions/_shared/nutritionCore';
