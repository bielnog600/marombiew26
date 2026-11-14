import React from 'react';
import { cn } from '@/lib/utils';
import { toneColor, type PhaseTone, type ProgressSegment, RPE_LABELS } from '@/lib/tabataPlayerView';

/** Cronômetro em anel: o traço esvazia com o tempo, número grande no centro na cor da fase. */
export const TimerRing: React.FC<{
  seconds: number; fraction: number; tone: PhaseTone; size?: number; testId?: string; caption?: string;
}> = ({ seconds, fraction, tone, size = 132, testId = 'tabata-ring', caption }) => {
  const stroke = Math.max(6, Math.round(size * 0.07));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  const last3 = seconds > 0 && seconds <= 3;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid={testId}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--tabata-border))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={toneColor(tone)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('font-black tabular-nums leading-none', last3 && 'animate-tabata-pulse')}
          style={{ color: toneColor(tone), fontSize: Math.round(size * 0.4) }}
          data-testid={`${testId}-seconds`}
        >
          {seconds}
        </span>
        {caption && <span className="mt-1 text-[10px] uppercase tracking-widest text-tabata-soft">{caption}</span>}
      </div>
    </div>
  );
};

export const PhaseChip: React.FC<{ tone: PhaseTone; children: React.ReactNode; testId?: string }> = ({ tone, children, testId }) => (
  <span
    data-testid={testId}
    className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
    style={{ color: toneColor(tone), background: toneColor(tone, 0.14), boxShadow: `inset 0 0 0 1px ${toneColor(tone, 0.35)}` }}
  >
    {children}
  </span>
);

/** Barra segmentada: um segmento por bloco (aquecimento menor), cada um na cor da intensidade. */
export const SegmentedProgress: React.FC<{ segments: ProgressSegment[] }> = ({ segments }) => (
  <div className="flex gap-1 h-1.5" data-testid="tabata-progress">
    {segments.map((s) => (
      <div
        key={s.blockNumber}
        className="relative h-full overflow-hidden rounded-full"
        style={{ flexGrow: Math.max(1, s.seconds), flexBasis: 0, background: toneColor(s.tone, 0.18) }}
      >
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${s.fill * 100}%`, background: toneColor(s.tone), transition: 'width 0.3s linear' }} />
      </div>
    ))}
  </div>
);

/** Bolinhas das rodadas do bloco: feitas e a atual preenchidas na cor da fase. */
export const RoundDots: React.FC<{ total: number; current: number; tone: PhaseTone; includeCurrent?: boolean }> = ({
  total, current, tone, includeCurrent = true,
}) => (
  <div className="flex items-center justify-center gap-1.5" data-testid="tabata-round-dots" aria-label={`Rodada ${current + 1} de ${total}`}>
    {Array.from({ length: total }, (_, i) => {
      const filled = i < current || (includeCurrent && i === current);
      return (
        <span
          key={i}
          className={cn('h-2 w-2 rounded-full transition-all', i === current && includeCurrent && 'h-2.5 w-2.5')}
          style={filled ? { background: toneColor(tone) } : { boxShadow: 'inset 0 0 0 1.5px hsl(var(--tabata-border))' }}
        />
      );
    })}
  </div>
);

export const RpePicker: React.FC<{ value: number | null; onChange: (v: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="space-y-2">
    <div role="radiogroup" aria-label="Quão pesado foi?" className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const tone: PhaseTone = n <= 4 ? 'warmup' : n <= 6 ? 'moderado' : n <= 8 ? 'forte' : 'maximo';
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`RPE ${n}`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="h-10 rounded-lg text-sm font-black tabular-nums transition-all disabled:opacity-50"
            style={active
              ? { background: toneColor(tone), color: 'hsl(var(--tabata-bg))' }
              : { background: 'hsl(var(--tabata-bg))', color: toneColor(tone), boxShadow: 'inset 0 0 0 1px hsl(var(--tabata-border))' }}
          >
            {n}
          </button>
        );
      })}
    </div>
    <p className="text-center text-xs text-tabata-soft h-4" data-testid="tabata-rpe-label">
      {value ? `${value} · ${RPE_LABELS[value]}` : 'Toque num número de 1 (muito leve) a 10 (máximo)'}
    </p>
  </div>
);
