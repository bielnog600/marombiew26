import type { DepthLevel, Landmark, Side } from '../squatAnalysis';

/** Id da regra salvo em camera_sessions.exercise_rule. */
export type ExerciseRuleId = 'squat' | 'stiff' | 'bulgaro';
/** Vista que a câmera precisa ter da pessoa. */
export type CameraView = 'side' | 'front';
/** Contorno guia mostrado no posicionamento. */
export type SilhouetteKind = 'standing' | 'split' | 'split_bench';

/** Rep de qualquer exercício, no formato que a tela e o resumo usam. */
export interface LiveRep {
  index: number;
  complete: boolean;
  /** Chaves de `ExerciseRule.messages`. */
  errors: string[];
  descentSeconds: number | null;
  fastDescent: boolean;
  /** Búlgaro/afundo: perna da frente usada na rep. */
  leg?: Side;
}

/** Contador de reps de uma regra. Recebe os pontos do MediaPipe já suavizados. */
export interface LiveRepCounter {
  readonly ruleId: ExerciseRuleId;
  readonly reps: LiveRep[];
  /** No meio de uma rep (abaixo do limite de início). */
  readonly inRep: boolean;
  /** Último frame no topo (posição inicial), usado pelo fim automático. */
  readonly atTop: boolean;
  readonly level: DepthLevel;
  setDepthLevel(level: unknown): void;
  reset(): void;
  abortRep(): void;
  /** Só aceita a próxima rep depois de ver a pessoa no topo. */
  waitForStanding(): void;
  /** Lado do corpo usado para medir e para checar o corpo inteiro. */
  measureSide(lms: Landmark[]): Side;
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number): LiveRep | null;
  /** Só búlgaro/afundo. */
  readonly frontLeg?: Side;
  setFrontLeg?(leg: Side): void;
}

export interface ExerciseRule {
  id: ExerciseRuleId;
  /** Nome exibido. */
  label: string;
  /** Palavras (já normalizadas: maiúsculas, sem acento) que casam com o nome do exercício. */
  keywords: string[];
  view: CameraView;
  /** Instrução de posicionamento (pode depender do nome, ex.: búlgaro com banco). */
  instruction(exerciseName?: string | null): string;
  silhouette(exerciseName?: string | null): SilhouetteKind;
  /** Mensagem de cada erro/aviso. */
  messages: Record<string, string>;
  /** Descida mais rápida que isto = "Controla a descida". */
  minDescentSeconds: number;
  /** Precisa escolher a perna da frente (búlgaro/afundo). */
  needsFrontLeg: boolean;
  /** O que cada nível de profundidade exige, em texto curto. */
  levelHints: Record<DepthLevel, string>;
  createCounter(level?: unknown, frontLeg?: Side): LiveRepCounter;
}
