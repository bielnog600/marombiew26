import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ParsedTrainingDay, ParsedExercise } from '@/lib/trainingResultParser';

// Normalize exercise name for consistent DB lookups
export const normalizeExName = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();

export interface SetEntry {
  weight: string;
  reps: string;
}

export interface SetPlan {
  kind: 'recon' | 'work';
  targetReps: string;
}

export interface SetSchemeInput {
  mode: 'uniform' | 'recognition_work' | 'per_set';
  sets: Array<{ set_number: number; set_type: 'work' | 'recognition'; target_reps: string }>;
}

export const splitComposed = (reps: string): [string, string] => {
  const parts = (reps || '').split('+').map((p) => p.trim());
  return [parts[0] || '', parts[1] || parts[0] || ''];
};

export const buildSetPlan = (
  series: string,
  series2: string,
  reps: string,
  setScheme?: SetSchemeInput | null,
): SetPlan[] => {
  if (setScheme && setScheme.mode === 'per_set' && Array.isArray(setScheme.sets) && setScheme.sets.length > 0) {
    return [...setScheme.sets]
      .sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
      .map((s) => ({
        kind: (s.set_type === 'recognition' ? 'recon' : 'work') as 'recon' | 'work',
        targetReps: String(s.target_reps || '').trim(),
      }));
  }
  const s1 = parseInt(String(series ?? '') || '0', 10) || 0;
  const s2 = parseInt(String(series2 ?? '') || '0', 10) || 0;
  const [reconReps, workReps] = splitComposed(reps ?? '');
  const plan: SetPlan[] = [];
  if (s1 > 0 && s2 > 0) {
    for (let i = 0; i < s1; i++) plan.push({ kind: 'recon', targetReps: reconReps || reps || '' });
    for (let i = 0; i < s2; i++) plan.push({ kind: 'work', targetReps: workReps || reps || '' });
  } else {
    const total = s2 > 0 ? s2 : (s1 > 0 ? s1 : 3);
    for (let i = 0; i < total; i++) plan.push({ kind: 'work', targetReps: reps || '' });
  }
  return plan;
};

export const makeDaySignature = (day?: ParsedTrainingDay | null) => {
  const raw = (day?.exercises || [])
    .map((ex) => [ex.exercise, ex.series, ex.series2, ex.reps, ex.rir, ex.pause, ex.description, ex.variation].join('§'))
    .join('¶');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36) || 'empty';
};

export const draftKey = (studentId: string, dayName: string, planSignature: string) => {
  const today = new Date().toISOString().slice(0, 10);
  return `trainerlog:${studentId}:${dayName}:${today}:${planSignature}`;
};

export interface DraftShape {
  sets: Record<number, SetEntry[]>;
  notes: Record<number, string>;
  savedSets: Record<number, number>;
  exerciseNames?: Record<number, string>;
  plans?: Record<number, SetPlan[]>;
  exercises?: ParsedExercise[];
}

export const loadDraft = (studentId: string, dayName: string, planSignature: string): DraftShape | null => {
  try {
    const raw = localStorage.getItem(draftKey(studentId, dayName, planSignature));
    return raw ? (JSON.parse(raw) as DraftShape) : null;
  } catch {
    return null;
  }
};

export const saveDraft = (
  studentId: string,
  dayName: string,
  planSignature: string,
  state: Record<number, any>,
  exercises?: ParsedExercise[],
) => {
  try {
    const draft: DraftShape = { sets: {}, notes: {}, savedSets: {}, exerciseNames: {}, plans: {} };
    Object.entries(state).forEach(([k, v]) => {
      const idx = Number(k);
      draft.sets[idx] = v.sets;
      draft.notes[idx] = v.notes;
      draft.savedSets[idx] = v.savedSets;
      draft.exerciseNames![idx] = v.exerciseName;
      draft.plans![idx] = v.plan;
    });
    if (exercises) draft.exercises = exercises;
    localStorage.setItem(draftKey(studentId, dayName, planSignature), JSON.stringify(draft));
  } catch {
    // ignore quota errors
  }
};

export const parsePauseSeconds = (raw?: string | null): number => {
  if (!raw) return 60;
  const s = String(raw).trim().toLowerCase();
  const mmss = s.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  if (/min/.test(s)) {
    const n = parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Math.round((isFinite(n) ? n : 1) * 60);
  }
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return isFinite(n) && n > 0 ? n : 60;
};
