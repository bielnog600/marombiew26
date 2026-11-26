import React from 'react';
import { Check } from 'lucide-react';
import type { StickerBackground, StickerLogoSize, StickerStyle } from '@/lib/shareSticker';

const Y = '#F5C400';
const WHITE = '#FFFFFF';
const DARK = '#0F1115';
const SHADOW = '0 2px 10px rgba(0,0,0,0.55)';
const LOGO_SHADOW = 'drop-shadow(0 6px 16px rgba(0,0,0,.55))';
const LOGO_SCALE: Record<StickerLogoSize, number> = { P: 0.72, M: 1, G: 1.35 };

const WEEK = [
  { label: 'S', idx: 1, name: 'Segunda' },
  { label: 'T', idx: 2, name: 'Terça' },
  { label: 'Q', idx: 3, name: 'Quarta' },
  { label: 'Q', idx: 4, name: 'Quinta' },
  { label: 'S', idx: 5, name: 'Sexta' },
  { label: 'S', idx: 6, name: 'Sábado' },
  { label: 'D', idx: 0, name: 'Domingo' },
];

export interface WorkoutStickerData {
  logoSrc: string;
  timeText: string;
  dayName: string;
  exercisesText: string;
  durationText: string;
  weekDays: boolean[];
}

export interface StickerArtProps {
  style: StickerStyle;
  data: WorkoutStickerData;
  logoSize?: StickerLogoSize;
  background?: StickerBackground;
  thumbnail?: boolean;
}

const textStyle: React.CSSProperties = { color: WHITE, textShadow: SHADOW };

const Logo = ({ src, base, size, thumbnail }: { src: string; base: number; size: StickerLogoSize; thumbnail?: boolean }) => (
  <img
    src={src}
    alt={thumbnail ? '' : 'MAROMBIEW'}
    data-testid={thumbnail ? undefined : 'sticker-logo'}
    draggable={false}
    style={{
      display: 'block',
      height: Math.round(base * LOGO_SCALE[size]),
      width: 'auto',
      maxWidth: '100%',
      objectFit: 'contain',
      flexShrink: 0,
      border: 'none',
      outline: 'none',
      boxShadow: 'none',
      background: 'transparent',
      filter: LOGO_SHADOW,
    }}
  />
);

const Time = ({ children, size, align = 'center' }: { children: string; size: number; align?: 'center' | 'left' }) => (
  <div
    className="font-mono font-black tabular-nums leading-none"
    style={{ color: Y, fontSize: size, textAlign: align, whiteSpace: 'nowrap', textShadow: `0 0 28px rgba(245,196,0,0.30), ${SHADOW}` }}
  >
    {children}
  </div>
);

const Day = ({ children, size = 16 }: { children: string; size?: number }) => (
  <div className="font-black uppercase leading-tight" style={{ ...textStyle, fontSize: size }}>{children}</div>
);

const Exercises = ({ children, size = 12 }: { children: string; size?: number }) => (
  <div className="font-bold whitespace-nowrap" style={{ ...textStyle, fontSize: size }}>{children} exercícios</div>
);

const WeekFrequency = ({
  days,
  size = 'md',
  columns = 7,
  thumbnail,
}: {
  days: boolean[];
  size?: 'mini' | 'sm' | 'md' | 'lg';
  columns?: 4 | 7;
  thumbnail?: boolean;
}) => {
  const circle = { mini: 13, sm: 19, md: 27, lg: 34 }[size];
  const label = { mini: 7, sm: 8, md: 9, lg: 11 }[size];
  return (
    <div
      aria-label={thumbnail ? undefined : 'Frequência da semana'}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, ${circle}px)`, gap: size === 'lg' ? 7 : 4, width: 'max-content' }}
    >
      {WEEK.map((day, index) => {
        const done = Boolean(days[day.idx]);
        return (
          <div key={`${day.name}-${index}`} className="flex flex-col items-center" style={{ gap: size === 'mini' ? 2 : 4 }}>
            <span
              data-testid={thumbnail ? undefined : 'sticker-week-day'}
              data-week-index={day.idx}
              data-done={done}
              aria-label={thumbnail ? undefined : `${day.name}: ${done ? 'treinado' : 'não treinado'}`}
              className="rounded-full flex items-center justify-center"
              style={{
                width: circle,
                height: circle,
                background: done ? Y : 'transparent',
                border: done ? 'none' : '1.5px solid rgba(255,255,255,0.48)',
                boxShadow: done ? '0 2px 8px rgba(0,0,0,0.35)' : SHADOW,
              }}
            >
              {done && <Check style={{ color: DARK, width: circle * 0.62, height: circle * 0.62 }} strokeWidth={3.5} />}
            </span>
            <span className="font-bold leading-none" style={{ ...textStyle, fontSize: label }}>{day.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Stats = ({ data, size = 11 }: { data: WorkoutStickerData; size?: number }) => (
  <div className="flex items-center justify-center gap-2" style={{ ...textStyle, fontSize: size }}>
    <Exercises size={size}>{data.exercisesText}</Exercises>
    <span style={{ color: Y }}>•</span>
    <span className="font-semibold whitespace-nowrap">{data.durationText}</span>
  </div>
);

export const StickerArt: React.FC<StickerArtProps> = ({
  style,
  data,
  logoSize = 'M',
  background = 'transparente',
  thumbnail = false,
}) => {
  const logo = (base: number) => <Logo src={data.logoSrc} base={base} size={logoSize} thumbnail={thumbnail} />;
  const time = (size: number, align: 'center' | 'left' = 'center') => <Time size={size} align={align}>{data.timeText}</Time>;
  const day = (size?: number) => <Day size={size}>{data.dayName}</Day>;
  const exercises = (size?: number) => <Exercises size={size}>{data.exercisesText}</Exercises>;
  const week = (size: 'mini' | 'sm' | 'md' | 'lg' = 'sm', columns: 4 | 7 = 7) => (
    <WeekFrequency days={data.weekDays} size={size} columns={columns} thumbnail={thumbnail} />
  );

  const widths: Record<StickerStyle, number> = {
    tempo: 238,
    mini: 246,
    frequencia: 278,
    selo: 230,
    'logo-topo-grande': 284,
    'logo-topo-pequena': 252,
    'logo-central': 278,
    'logo-embaixo': 262,
    horizontal: 340,
    faixa: 340,
    coluna: 190,
    'semana-destaque': 292,
    minimal: 226,
    'marca-dagua': 202,
  };

  const rootStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    width: widths[style],
    maxWidth: '100%',
    padding: style === 'faixa' ? '10px 12px' : '12px 14px',
    color: WHITE,
    background: background === 'vidro' ? 'rgba(15,17,21,0.68)' : 'transparent',
    backdropFilter: background === 'vidro' ? 'blur(14px)' : 'none',
    WebkitBackdropFilter: background === 'vidro' ? 'blur(14px)' : 'none',
    border: background === 'vidro' ? '1px solid rgba(255,255,255,0.12)' : 'none',
    borderRadius: background === 'vidro' ? 22 : 0,
  };

  let content: React.ReactNode;
  switch (style) {
    case 'tempo':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(54)}<span className="text-[9px] uppercase tracking-[0.28em]" style={textStyle}>Tempo total</span>{time(54)}{day(17)}{exercises()}{week('sm')}</div>;
      break;
    case 'mini':
      content = <div className="flex flex-col items-center gap-2"><div className="flex items-center justify-center gap-3">{logo(32)}<div>{time(30)}{day(11)}</div></div><Stats data={data} />{week('mini')}</div>;
      break;
    case 'frequencia':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(29)}<span className="text-[9px] uppercase tracking-[0.2em]" style={textStyle}>Frequência da semana</span>{time(32)}{exercises()}{week('md')}</div>;
      break;
    case 'selo':
      content = <div className="flex flex-col items-center gap-2">{logo(62)}<div className="rounded-full px-4 py-2 font-black text-sm whitespace-nowrap" style={{ background: Y, color: DARK, boxShadow: SHADOW }}>TREINO FEITO · <span className="font-mono tabular-nums">{data.timeText}</span></div>{exercises(11)}{week('mini')}</div>;
      break;
    case 'logo-topo-grande':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(88)}<span className="text-[9px] uppercase tracking-[0.28em]" style={textStyle}>Tempo total</span>{time(60)}{day(19)}<Stats data={data} />{week('sm')}</div>;
      break;
    case 'logo-topo-pequena':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(36)}{time(62)}{day(15)}{exercises()}{week('mini')}</div>;
      break;
    case 'logo-central':
      content = <div className="flex flex-col items-center text-center gap-2">{time(43)}{logo(80)}{day(16)}<Stats data={data} />{week('sm')}</div>;
      break;
    case 'logo-embaixo':
      content = <div className="flex flex-col items-center text-center gap-2">{time(50)}{day(17)}{exercises()}{week('sm')}{logo(52)}</div>;
      break;
    case 'horizontal':
      content = <div className="flex items-center justify-center gap-4">{logo(62)}<div className="flex flex-col items-start gap-2">{time(39, 'left')}{day(12)}{exercises(11)}{week('mini')}</div></div>;
      break;
    case 'faixa':
      content = <div className="flex items-center justify-between gap-3">{logo(30)}<div className="flex flex-col items-center gap-1">{time(25)}{exercises(9)}</div>{week('mini')}</div>;
      break;
    case 'coluna':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(44)}{time(43)}{day(14)}{exercises(11)}{week('sm', 4)}</div>;
      break;
    case 'semana-destaque':
      content = <div className="flex flex-col items-center text-center gap-2">{logo(30)}<span className="text-[9px] uppercase tracking-[0.2em]" style={textStyle}>Frequência da semana</span>{week('lg')}{time(35)}{exercises(11)}</div>;
      break;
    case 'minimal':
      content = <div className="flex flex-col items-center gap-2"><div className="self-start">{logo(25)}</div>{time(42)}{exercises(11)}{week('mini')}</div>;
      break;
    case 'marca-dagua':
      content = <div className="flex flex-col items-center text-center gap-2">{time(36)}{exercises(10)}{week('mini')}<div className="font-black uppercase tracking-[0.28em] text-[9px] mt-1" style={{ color: Y, textShadow: SHADOW }}>MAROMBIEW</div></div>;
      break;
  }

  return (
    <div
      data-testid={thumbnail ? 'sticker-thumbnail-art' : `sticker-${style}`}
      data-layout={style}
      data-logo-size={logoSize}
      data-background={background}
      style={rootStyle}
    >
      {content}
    </div>
  );
};
