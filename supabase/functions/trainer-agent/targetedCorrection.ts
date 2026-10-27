// Pure helpers for the trainer-agent targeted correction (no I/O).

export function buildTargetedCorrectionPrompt(violations: string): string {
  return [
    "CORREÇÃO DIRECIONADA do plano JSON acima (sua resposta anterior). NÃO gere um treino novo.",
    `Violações objetivas encontradas pelo servidor: ${violations}`,
    "Corrija SOMENTE os dias/exercícios necessários para eliminar essas violações, respeitando todas as regras do sistema, o catálogo e a referência.",
    "Responda no mesmo schema JSON, mas em \"days\" inclua APENAS os dias alterados, cada um COMPLETO (todos os exercícios do dia, na ordem final) e com o MESMO \"id\" e o MESMO \"day\" do plano original. Dias sem alteração não devem ser enviados.",
    "Mantenha \"version\", \"type\" e \"metadata\" iguais aos do plano original.",
  ].join("\n");
}

/** Replaces corrected days (matched by id, then by day label) in a deep copy
 * of the base plan. Unknown days are ignored so the week structure never changes. */
export function mergeCorrectedDays(base: any, patch: any): any {
  const merged = JSON.parse(JSON.stringify(base ?? {}));
  const days: any[] = Array.isArray(merged.days) ? merged.days : [];
  const label = (d: any) => String(d?.day ?? "").trim().toLowerCase();
  for (const fixed of Array.isArray(patch?.days) ? patch.days : []) {
    let index = days.findIndex((d) => d?.id && d.id === fixed?.id);
    if (index < 0) index = days.findIndex((d) => label(d) && label(d) === label(fixed));
    if (index < 0) continue;
    days[index] = { ...fixed, id: days[index].id, day: days[index].day };
  }
  merged.days = days;
  return merged;
}
