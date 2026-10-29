/** Janela em que um aluno conta como "online agora" sem sinal de presença. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export interface AccessRowInput {
  id: string;
  name: string;
  /** Horários de acesso/atividade registrados hoje (ISO). */
  activity: string[];
  /** Aluno com o app aberto agora (canal de presença). */
  present: boolean;
}

export interface AccessRow {
  id: string;
  name: string;
  firstAccess?: string;
  lastAccess?: string;
  accessCount: number;
  online: boolean;
}

const ts = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

/**
 * Online = app aberto agora (presença) OU atividade nos últimos 5 minutos.
 * Ordem: online primeiro; depois último acesso mais recente; empate por nome.
 */
export function buildAccessRows(inputs: AccessRowInput[], now = Date.now()): AccessRow[] {
  return inputs
    .map((i) => {
      const times = i.activity.filter(Boolean).sort();
      const last = times[times.length - 1];
      const recent = last ? now - ts(last) <= ONLINE_WINDOW_MS : false;
      return {
        id: i.id,
        name: i.name,
        firstAccess: times[0],
        lastAccess: last,
        accessCount: times.length,
        online: i.present || recent,
      };
    })
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const d = ts(b.lastAccess) - ts(a.lastAccess);
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });
}
