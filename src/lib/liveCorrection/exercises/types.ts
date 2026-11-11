import type { DepthLevel, Landmark, Side } from '../squatAnalysis';

/** Id da regra salvo em camera_sessions.exercise_rule. */
export type ExerciseRuleId =
  | 'squat' | 'stiff' | 'bulgaro' | 'lateral_raise' | 'hip_thrust'
  | 'curl' | 'triceps_french' | 'shoulder_press'
  | 'bench_press' | 'leg_press' | 'plank';
/** Vista que a câmera precisa ter da pessoa. */
export type CameraView = 'side' | 'front';
/** Contorno guia mostrado no posicionamento. */
export type SilhouetteKind = 'standing' | 'split' | 'split_bench' | 'front_upper' | 'hip_thrust' | 'side_upper'
  | 'bench' | 'leg_press' | 'plank';

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
  /**
   * Parado numa posição de descanso, para o fim automático (elevação pélvica: no topo ou
   * parado embaixo). Sem isto, o fim automático usa `atTop` fora de uma rep.
   */
  readonly resting?: boolean;
  /** Fecha uma rep que ainda espera o fim (elevação pélvica segurando em cima) ao finalizar a série. */
  flush?(): LiveRep | null;
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
  /** `exerciseName` permite variações dentro da regra (ex.: rosca Scott sem checar cotovelo/balanço). */
  createCounter(level?: unknown, frontLeg?: Side, exerciseName?: string | null): LiveRepCounter;
  /** Pontos que precisam aparecer; sem isto, exige o corpo inteiro (cabeça até tornozelo). */
  isBodyVisible?(lms: Landmark[] | null | undefined, side: Side): boolean;
  /** Aviso quando os pontos exigidos saem do quadro; sem isto, "Corpo inteiro na câmera". */
  lostMessage?: string;
  /** Pontos e medida de referência do "fica parado"; sem isto, ombro/quadril/tornozelo e ombro→tornozelo. */
  stillPoints?: readonly number[];
  stillScale?(lms: Landmark[], width: number, height: number, side: Side): number;
  /**
   * Linhas desenhadas na câmera; sem isto, 'legs' (ombro-quadril-joelho-tornozelo).
   * 'arms' = os dois braços iguais (de frente); 'arm_side' = braço do lado medido em destaque (de lado).
   */
  skeleton?: 'legs' | 'arms' | 'arm_side';
  /** Texto da tela inicial sobre quando a contagem começa; sem isto, o texto padrão da vista. */
  startHint?: string;
  /** Avisos falados no máximo 1x por série (continuam na tela e no resumo). */
  speakOncePerSeries?: readonly string[];
  /** Palavras que impedem o casamento (ex.: "PRANCHA LATERAL" não é a prancha frontal). */
  excludeKeywords?: string[];
  /**
   * Com os pontos visíveis, o que ainda impede de liberar (ex.: prancha fora da horizontal);
   * null = pode liberar. Sem isto, só os pontos visíveis, de lado e parado.
   */
  notReadyMessage?(lms: Landmark[], side: Side, width: number, height: number): string | null;
  /** Exercício de tempo (prancha): `createCounter` devolve um `TimedCounter` e a tela mostra cronômetro. */
  timed?: boolean;
}

/** Um frame de um exercício de tempo. */
export interface TimedFrame {
  /** Na posição do exercício (conta no tempo total). */
  inPosition: boolean;
  /** Em boa posição (conta no cronômetro). */
  good: boolean;
  /** Erro de posição confirmado agora (chave de `messages`); null = sem erro. */
  fault: string | null;
  /** Erro que acabou de começar (conta 1 vez no resumo). */
  newFault: string | null;
  /** Segundos em boa posição que acabaram de virar múltiplo de 10 (para falar); null = nenhum. */
  tenMark: number | null;
  /** Fora da posição tempo demais: encerra a série. */
  autoFinish: boolean;
  goodMs: number;
  totalMs: number;
}

export interface TimedSummary {
  totalSeconds: number;
  goodSeconds: number;
  goodPercent: number;
  /** Quantas vezes cada erro começou (chaves de `messages`). */
  faults: Record<string, number>;
}

/** Contador de um exercício de tempo; os métodos de rep existem só para a tela tratar tudo igual. */
export interface TimedCounter extends LiveRepCounter {
  readonly timed: true;
  /** `lms` null = fora do quadro ou de frente. */
  track(lms: Landmark[] | null, width: number, height: number, side: Side, t: number): TimedFrame;
  summary(): TimedSummary;
}
