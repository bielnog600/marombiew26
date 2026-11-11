/**
 * Regra "squat": o agachamento de sempre (squatAnalysis.ts), sem mudanças de comportamento.
 */
import {
  DEPTH_LEVELS, ERROR_MESSAGES, MIN_DESCENT_SECONDS, POSITION_MESSAGES, REP_END_KNEE_ANGLE,
  SquatRepCounter, frameMetrics, pickSide, type DepthLevel, type Landmark, type Side,
} from '../squatAnalysis';
import type { ExerciseRule, LiveRep, LiveRepCounter } from './types';

class SquatRuleCounter implements LiveRepCounter {
  readonly ruleId = 'squat' as const;
  private readonly inner: SquatRepCounter;
  private lastKnee: number | null = null;
  constructor(level?: unknown) { this.inner = new SquatRepCounter(level); }
  get reps(): LiveRep[] { return this.inner.reps; }
  get inRep() { return this.inner.inRep; }
  get atTop() { return !this.inner.inRep && this.lastKnee != null && this.lastKnee > REP_END_KNEE_ANGLE; }
  get level() { return this.inner.level; }
  setDepthLevel(level: unknown) { this.inner.setDepthLevel(level); }
  reset() { this.inner.reset(); this.lastKnee = null; }
  abortRep() { this.inner.abortRep(); this.lastKnee = null; }
  waitForStanding() { this.inner.waitForStanding(); this.lastKnee = null; }
  measureSide(lms: Landmark[]): Side { return pickSide(lms); }
  update(lms: Landmark[], width: number, height: number, side: Side, t?: number): LiveRep | null {
    const m = frameMetrics(lms, width, height, side);
    this.lastKnee = m.kneeAngle;
    return this.inner.update(m, t);
  }
}

export const squatRule: ExerciseRule = {
  id: 'squat',
  label: 'Agachamento',
  // AGACHAMENTO cobre livre, Smith, sumô etc.; GLOBET é como o app escreve goblet.
  keywords: ['AGACHAMENTO', 'GOBLET', 'GLOBET'],
  view: 'side',
  instruction: () => POSITION_MESSAGES.no_body,
  silhouette: () => 'standing',
  messages: ERROR_MESSAGES,
  minDescentSeconds: MIN_DESCENT_SECONDS,
  needsFrontLeg: false,
  levelHints: Object.fromEntries(
    (Object.keys(DEPTH_LEVELS) as DepthLevel[]).map((l) => [l, DEPTH_LEVELS[l].hint]),
  ) as Record<DepthLevel, string>,
  createCounter: (level) => new SquatRuleCounter(level),
};
