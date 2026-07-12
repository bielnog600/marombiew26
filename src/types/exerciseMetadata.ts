// Central types for Phase 2A exercise metadata + training methods.
// Do NOT import these into trainer-agent yet — Phase 2A is data-only.

export type ExerciseClass =
  | 'compound'
  | 'isolation'
  | 'power'
  | 'plyometric'
  | 'mobility'
  | 'cardio'
  | 'core'
  | 'rehabilitation'
  | 'other';

export type StabilityLevel = 'high' | 'moderate' | 'low';
export type TechnicalComplexity = 'low' | 'moderate' | 'high' | 'very_high';
export type LoadLevel = 'none' | 'low' | 'moderate' | 'high';
export type FatigueCost = 'low' | 'moderate' | 'high' | 'very_high';

export type MetadataStatus =
  | 'unclassified'
  | 'suggested'
  | 'pending_review'
  | 'approved'
  | 'rejected';

export type MetadataSource = 'manual' | 'rule' | 'ai' | 'imported';

export interface ExerciseMetadata {
  movement_pattern: string | null;
  exercise_class: ExerciseClass | null;
  equipment_type: string | null;
  stability_level: StabilityLevel | null;
  technical_complexity: TechnicalComplexity | null;
  axial_load: LoadLevel | null;
  lumbar_load: LoadLevel | null;
  balance_requirement: LoadLevel | null;
  fatigue_cost: FatigueCost | null;
  safe_to_failure: boolean | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
  contraindications: string[] | null;
  metadata_status: MetadataStatus | null;
  metadata_confidence: number | null;
  metadata_source: MetadataSource | null;
  metadata_reviewed_by: string | null;
  metadata_reviewed_at: string | null;
  metadata_version: number | null;
}

export type TrainingMethodCategory =
  | 'base'
  | 'progression'
  | 'intensity'
  | 'density'
  | 'strength'
  | 'hypertrophy'
  | 'power'
  | 'rehabilitation'
  | 'specialized';

export type TrainingMethodLevel =
  | 'beginner'
  | 'intermediate'
  | 'advanced'
  | 'professional_only';

export type TrainingMethodSlug =
  | 'traditional_sets'
  | 'double_progression'
  | 'ramping_sets'
  | 'top_set_backoff'
  | 'paused_reps'
  | 'tempo_reps'
  | 'antagonist_superset'
  | 'non_competing_superset'
  | 'pre_exhaustion'
  | 'post_exhaustion'
  | 'rest_pause'
  | 'myo_reps'
  | 'drop_set'
  | 'mechanical_drop_set'
  | 'one_and_half_reps'
  | 'lengthened_partials'
  | 'isometric_hold'
  | 'amrap_with_rir_cap'
  | 'density_sets'
  | 'cluster_set'
  | 'complex_training'
  | 'contrast_training'
  | 'velocity_based_training'
  | 'eccentric_overload'
  | 'blood_flow_restriction';

export interface TrainingMethod {
  id: string;
  slug: TrainingMethodSlug | string;
  name: string;
  description: string | null;
  category: TrainingMethodCategory | null;
  min_level: TrainingMethodLevel | null;
  fatigue_score: number | null;
  technical_risk_score: number | null;
  requires_professional_supervision: boolean;
  requires_special_equipment: boolean;
  default_parameters: Record<string, unknown> | null;
  safety_notes: string[] | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface ExerciseMetadataSuggestion {
  id: string;
  exercise_id: string;
  proposed_metadata: Partial<ExerciseMetadata>;
  confidence: number | null;
  source: MetadataSource | null;
  status: SuggestionStatus;
  reasoning: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
}