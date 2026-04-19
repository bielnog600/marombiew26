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
