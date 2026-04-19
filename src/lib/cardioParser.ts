// Tipos e utilidades para protocolos de cardio gerados pela IA.
// O conteúdo é armazenado em ai_plans.conteudo como JSON serializado.

export type CardioModality = 'passadeira' | 'bike' | 'eliptica' | 'escada';
export type CardioStructure = 'continuo' | 'intervalado' | 'hiit' | 'zona2';
export type CardioIntensity = 'leve' | 'moderada' | 'intensa';
export type CardioLevel = 'iniciante' | 'intermediario' | 'avancado';

export type CardioBlockType =
  | 'aquecimento'
  | 'principal'
  | 'pico'
  | 'recuperacao'
  | 'desaceleracao';

export type CardioBlockIntensity = 'leve' | 'moderada' | 'forte' | 'maxima';

export interface CardioBlock {
  name: string;
  type: CardioBlockType;
  durationSec: number;
  intensityLabel: CardioBlockIntensity;
  targetZone?: string;
  targetHrRange?: string;
  speedKmh?: number;
  inclinePct?: number;
  cadenceRpm?: number;
  resistanceLevel?: number;
  bikePosition?: 'sentado' | 'em_pe' | 'alternado';
  stepsPerMin?: number;
  notes?: string;
}

export interface CardioProtocol {
  title: string;
  modality: CardioModality;
  objective: string;
  level: CardioLevel;
  intensity: CardioIntensity;
  structure: CardioStructure;
  totalDurationMin: number;
  frequencyPerWeek: number;
  targetZoneSummary?: string;
  safetyNotes?: string[];
  executionTips?: string[];
  blocks: CardioBlock[];
}

// Plano semanal: vários protocolos diferentes, um por dia da frequência semanal
export interface CardioWeeklyPlan {
  weekly: true;
  frequencyPerWeek: number;
  protocols: CardioProtocol[];
}

export type CardioPayload = CardioProtocol | CardioWeeklyPlan;

export function isWeeklyPlan(payload: any): payload is CardioWeeklyPlan {
  return !!payload && payload.weekly === true && Array.isArray(payload.protocols);
}

export function parseCardioPayload(raw: string | null | undefined): CardioPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isWeeklyPlan(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.blocks)) return parsed as CardioProtocol;
    return null;
  } catch {
    return null;
  }
}

// Escolhe o protocolo do dia atual fazendo rotação pelo dia do ano,
// para variar a modalidade ao longo da semana.
export function pickProtocolForToday(payload: CardioPayload, date = new Date()): CardioProtocol | null {
  if (!payload) return null;
  if (!isWeeklyPlan(payload)) return payload;
  if (!payload.protocols.length) return null;
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  const idx = dayOfYear % payload.protocols.length;
  return payload.protocols[idx];
}

export const MODALITY_LABEL: Record<CardioModality, string> = {
  passadeira: 'Passadeira',
  bike: 'Bike',
  eliptica: 'Elíptica',
  escada: 'Escada',
};

export const STRUCTURE_LABEL: Record<CardioStructure, string> = {
  continuo: 'Contínuo',
  intervalado: 'Intervalado',
  hiit: 'HIIT',
  zona2: 'Zona 2',
};

export const INTENSITY_LABEL: Record<CardioIntensity, string> = {
  leve: 'Leve',
  moderada: 'Moderada',
  intensa: 'Intensa',
};

export function parseCardioProtocol(raw: string | null | undefined): CardioProtocol | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) return null;
    return parsed as CardioProtocol;
  } catch {
    return null;
  }
}

export function serializeCardioProtocol(protocol: CardioProtocol): string {
  return JSON.stringify(protocol, null, 2);
}

export function totalCardioDurationSec(protocol: CardioProtocol): number {
  return protocol.blocks.reduce((sum, b) => sum + (b.durationSec || 0), 0);
}

export function formatDurationFromSec(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min} min` : `${min} min ${sec}s`;
}
