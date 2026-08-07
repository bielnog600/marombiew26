import React, { useCallback, useEffect, useRef, useState } from 'react';

interface HomeCardsCarouselProps {
  children: React.ReactNode;
}

/**
 * Carrossel horizontal com scroll-snap suave para os cards principais da home
 * (Treino do dia, Cardio e TABATA).
 */
const HomeCardsCarousel: React.FC<HomeCardsCarouselProps> = ({ children }) => {
  const slides = React.Children.toArray(children).filter(Boolean);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    setActive(Math.min(Math.max(idx, 0), slides.length - 1));
  }, [slides.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (slides.length === 0) return null;
  if (slides.length === 1) return <>{slides[0]}</>;

  return (
    <div className="space-y-2" data-no-swipe>
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth -mx-4 px-4 gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {slides.map((slide, i) => (
          <div key={i} className="snap-center shrink-0 w-full">
            {slide}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para o card ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/40'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default HomeCardsCarousel;
