/**
 * Exibição do histórico de séries (popover "Histórico — X" do Modo Treino e
 * folha "Cargas — X" do aluno). Funções puras, só para mostrar:
 *  - TODAS as séries registradas aparecem, na ordem, com o rótulo do tipo;
 *  - log sem tipo (legado) ou tipo desconhecido = Trabalho;
 *  - carga top e volume da sessão continuam vindo só das séries de Trabalho
 *    (progressão, sugestão, recordes e volume não mudam).
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  isPreparationLogSetType,
  normalizePlanSetType,
  SET_TYPE_LABEL,
  SET_TYPE_TEXT_CLASS,
  type PlanSetType,
} from './setTypes';

export interface HistorySetRow {
  performed_at: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  set_type?: string | null;
  session_id?: string | null;
}

export interface HistorySetDisplay {
  type: PlanSetType;
  label: string;
  textClass: string;
}

/** Tipo exibido de um registro: aquecimento/preparatória/reconhecimento ou Trabalho. */
export const historySetDisplay = (raw: unknown): HistorySetDisplay => {
  const type = normalizePlanSetType(raw);
  return { type, label: SET_TYPE_LABEL[type], textClass: SET_TYPE_TEXT_CLASS[type] };
};

/** "17,5 kg" (pt-BR); sem carga = "—". */
export const formatHistoryKg = (kg: number | string | null | undefined): string => {
  if (kg === null || kg === undefined || kg === '') return '—';
  const n = Number(kg);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
};

const bySetNumber = <T extends { set_number: number }>(a: T, b: T) => a.set_number - b.set_number;

/** Popover do Modo Treino: agrupa por dia (dd/MM/yyyy), mais recente primeiro, séries em ordem. */
export const historyRowsByDate = <T extends HistorySetRow>(rows: T[] | null | undefined): Array<[string, T[]]> => {
  const groups = new Map<string, T[]>();
  [...(rows ?? [])]
    .sort((a, b) => +new Date(b.performed_at) - +new Date(a.performed_at))
    .forEach((r) => {
      const d = format(new Date(r.performed_at), 'dd/MM/yyyy', { locale: ptBR });
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(r);
    });
  return Array.from(groups.entries()).map(([d, sets]) => [d, [...sets].sort(bySetNumber)]);
};

export interface LoadHistorySession<T extends HistorySetRow> {
  sessionId: string;
  date: string;
  sets: T[];
  /** Maior carga entre as séries de Trabalho (0 quando não há). */
  topWeight: number;
  /** Volume (kg × reps) só das séries de Trabalho. */
  totalVolume: number;
  hasWork: boolean;
}

/** Folha do aluno: agrupa por sessão; todas as séries listadas, top/volume só de Trabalho. */
export const buildLoadHistorySessions = <T extends HistorySetRow>(rows: T[] | null | undefined): LoadHistorySession<T>[] => {
  const map = new Map<string, LoadHistorySession<T>>();
  (rows ?? []).forEach((row) => {
    const key = row.session_id || row.performed_at;
    let g = map.get(key);
    if (!g) {
      g = { sessionId: key, date: row.performed_at, sets: [], topWeight: 0, totalVolume: 0, hasWork: false };
      map.set(key, g);
    }
    g.sets.push(row);
    if (+new Date(row.performed_at) > +new Date(g.date)) g.date = row.performed_at;
    if (isPreparationLogSetType(row.set_type)) return;
    g.hasWork = true;
    const w = Number(row.weight_kg) || 0;
    const r = Number(row.reps) || 0;
    if (w > g.topWeight) g.topWeight = w;
    g.totalVolume += w * r;
  });
  const arr = Array.from(map.values()).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  arr.forEach((g) => g.sets.sort(bySetNumber));
  return arr;
};
