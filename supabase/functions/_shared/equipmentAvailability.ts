/**
 * Camada determinística de DISPONIBILIDADE de equipamento.
 *
 * Converte os IDs de máquinas selecionados na UI (`selectedMachines`) para o
 * vocabulário de equipamento usado pelo classificador funcional
 * (`EQUIP_RULES`: machine | cable | barbell | dumbbell | kettlebell |
 * bodyweight | band).
 *
 * Regras:
 * - mapeamento EXPLÍCITO, nunca fuzzy;
 * - granularidade de estação específica (ex.: "PUXADA ALTA ART." existe?) NÃO
 *   é inferida: estações de musculação viram apenas a capacidade `machine`;
 * - disponibilidade de equipamento é independente do PERFIL de exercícios.
 */

export type EquipmentCapability =
  | "machine"
  | "cable"
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "bodyweight"
  | "band";

const MACHINE_ID_CAPABILITIES: Record<string, EquipmentCapability[]> = {
  halteres: ["dumbbell"],
  barras_anilhas: ["barbell"],
  banco_regulavel: [],
  kettlebells: ["kettlebell"],
  polia_crossover: ["cable"],
  puxador_alto: ["cable", "machine"],
  remada_baixa: ["cable", "machine"],
  supino_maquina: ["machine"],
  peck_deck: ["machine"],
  gravitron: ["machine"],
  leg_press: ["machine"],
  extensora: ["machine"],
  flexora: ["machine"],
  abdutora_adutora: ["machine"],
  hack_squat: ["machine"],
  smith: ["machine"],
  barra_fixa: ["bodyweight"],
  paralelas: ["bodyweight"],
  elasticos: ["band"],
  trx: ["bodyweight"],
  // Cardio não gera capacidade de musculação.
  esteira: [],
  bike: [],
  eliptico: [],
  escada: [],
};

/**
 * Retorna a lista canônica de capacidades. Devolve `[]` quando a lista não é
 * confiável (vazia) — nesse caso o resto do sistema NÃO deve aplicar hard gate
 * de equipamento.
 */
export function mapMachineIdsToEquipmentCapabilities(
  ids: unknown,
): EquipmentCapability[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const out = new Set<EquipmentCapability>();
  for (const raw of ids) {
    const key = String(raw ?? "").trim().toLowerCase();
    const caps = MACHINE_ID_CAPABILITIES[key];
    if (!caps) continue;
    for (const c of caps) out.add(c);
  }
  if (out.size === 0) return [];
  // Peso corporal está sempre disponível quando existe qualquer equipamento.
  out.add("bodyweight");
  return [...out];
}
