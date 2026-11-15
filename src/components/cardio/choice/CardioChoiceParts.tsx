import React from 'react';
import { Activity, Bike, Footprints, HeartPulse, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CardioModality } from '@/lib/cardioParser';
import { toneColor, type PhaseTone } from '@/lib/tabataPlayerView';
import type { IntensityBar } from '@/lib/cardioChooser';

const MODALITY_ICON: Record<CardioModality, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  passadeira: Footprints, bike: Bike, eliptica: Activity, escada: TrendingUp,
};
const MODALITY_TONE: Record<CardioModality, PhaseTone> = {
  passadeira: 'warmup', bike: 'moderado', eliptica: 'rest', escada: 'forte',
};

/** Ícone da modalidade com fundo colorido. */
export const ModalityIcon: React.FC<{ modality: CardioModality; size?: 'sm' | 'md' }> = ({ modality, size = 'md' }) => {
  const Icon = MODALITY_ICON[modality] ?? HeartPulse;
  const tone = MODALITY_TONE[modality] ?? 'moderado';
  return (
    <div
      className={cn('rounded-xl flex items-center justify-center shrink-0', size === 'md' ? 'h-11 w-11' : 'h-9 w-9')}
      style={{ background: toneColor(tone, 0.16) }}
    >
      <Icon className={size === 'md' ? 'h-5 w-5' : 'h-4 w-4'} style={{ color: toneColor(tone) }} />
    </div>
  );
};

const LEVEL_HEIGHT = { low: '34%', mid: '60%', high: '100%' } as const;

/** Uma barra por etapa: largura pelo tempo, altura e cor pela intensidade (mostra onde estão os picos). */
export const IntensityBars: React.FC<{ bars: IntensityBar[]; className?: string; testId?: string }> = ({ bars, className, testId }) => (
  <div className={cn('flex items-end gap-[2px] w-full min-w-0', className)} data-testid={testId} aria-hidden>
    {bars.map((b, i) => (
      <div
        key={i}
        data-level={b.level}
        className="rounded-[3px] min-w-[2px]"
        style={{ flexGrow: b.seconds, flexBasis: 0, height: LEVEL_HEIGHT[b.level], background: toneColor(b.tone, b.peak ? 1 : 0.75) }}
      />
    ))}
  </div>
);

/** Shell em tela cheia (mesmo fundo escuro do player TABATA/cardio). */
export const CardioScreen: React.FC<{ header: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; testId?: string }> = ({
  header, footer, children, testId,
}) => (
  <div
    className="fixed inset-0 z-50 flex flex-col bg-tabata-bg text-foreground overflow-hidden"
    style={{ paddingTop: 'env(safe-area-inset-top)' }}
    data-testid={testId}
  >
    <header className="shrink-0 px-3 pt-2 pb-2">{header}</header>
    <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pb-6">{children}</main>
    {footer && (
      <footer
        className="shrink-0 px-4 pt-3 border-t border-tabata-border bg-tabata-bg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        {footer}
      </footer>
    )}
  </div>
);
