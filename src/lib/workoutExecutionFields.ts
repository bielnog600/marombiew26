import type { ExecutionMethodFields } from './workoutExecutionMethods';

/** Only recognized optional execution fields; legacy method objects are not reinterpreted. */
export function executionFields(raw: Record<string, unknown>): ExecutionMethodFields {
  return {
    ...(typeof raw.grupo_id === 'string' ? { grupo_id: raw.grupo_id } : {}),
    ...(raw.tipo_grupo === 'superset' || raw.tipo_grupo === 'biset' ? { tipo_grupo: raw.tipo_grupo } : {}),
    ...(raw.ordem_grupo === 'A' || raw.ordem_grupo === 'B' ? { ordem_grupo: raw.ordem_grupo } : {}),
    ...(typeof raw.pausa_grupo_s === 'number' ? { pausa_grupo_s: raw.pausa_grupo_s } : {}),
    ...(raw.metodo === 'nenhum' || raw.metodo === 'dropset' || raw.metodo === 'restpause' || raw.metodo === 'cluster' ? { metodo: raw.metodo } : {}),
    ...(raw.metodo_params && typeof raw.metodo_params === 'object' ? { metodo_params: raw.metodo_params as ExecutionMethodFields['metodo_params'] } : {}),
  };
}