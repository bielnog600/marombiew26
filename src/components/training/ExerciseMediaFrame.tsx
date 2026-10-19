import React from 'react';
import { safeVideoSrc } from '@/lib/exerciseVideoSrc';

/**
 * Moldura de vídeo/foto dos cards do Modo Treino (admin).
 * Altura reduzida (≈180px no celular, 220px em telas de tablet/desktop) com a
 * mídia recortada e centralizada, mantendo a largura total do card.
 */
const FRAME = 'relative w-full overflow-hidden rounded-md bg-muted aspect-[21/9] max-h-[180px] md:max-h-[220px]';

export interface ExerciseMediaFrameProps {
  embed?: string | null;
  imageUrl?: string | null;
  alt: string;
}

export const ExerciseMediaFrame = React.forwardRef<HTMLDivElement, ExerciseMediaFrameProps>(
  function ExerciseMediaFrame({ embed, imageUrl, alt }, ref) {
    const src = safeVideoSrc(embed);
    if (src) {
      // O iframe não aceita object-fit: a caixa 16:9 é centralizada dentro da
      // moldura mais baixa, cortando um pouco no topo e na base.
      return (
        <div ref={ref} className={FRAME}>
          <iframe
            src={src}
            title={`Vídeo ${alt}`}
            className="absolute left-0 top-1/2 w-full aspect-video -translate-y-1/2 border-0"
            allow="autoplay; fullscreen"
          />
        </div>
      );
    }
    if (embed && imageUrl) {
      return (
        <div ref={ref} className={FRAME}>
          <img
            src={imageUrl}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        </div>
      );
    }
    return null;
  },
);
