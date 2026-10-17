import { useEffect, useState } from 'react';

/**
 * Painel de diagnóstico temporário (só com ?debug=1) para medir a viewport no
 * iPhone/PWA. Não interage com a tela (pointer-events: none).
 */
const probe = (style: Partial<CSSStyleDeclaration>): number => {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '-9999px';
  el.style.width = '1px';
  el.style.visibility = 'hidden';
  el.style.pointerEvents = 'none';
  Object.assign(el.style, style);
  document.body.appendChild(el);
  const h = el.getBoundingClientRect().height;
  el.remove();
  return Math.round(h * 10) / 10;
};

const rectOf = (selector: string) => {
  const el = document.querySelector(selector);
  if (!el) return 'n/a';
  const r = el.getBoundingClientRect();
  return `h=${Math.round(r.height)} bottom=${Math.round(r.bottom)}`;
};

const measure = () => {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return [
    ['innerHeight', window.innerHeight],
    ['docEl.clientHeight', document.documentElement.clientHeight],
    ['visualViewport.h', window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a'],
    ['screen.height', window.screen.height],
    ['100vh', probe({ height: '100vh' })],
    ['100svh', probe({ height: '100svh' })],
    ['100lvh', probe({ height: '100lvh' })],
    ['100dvh', probe({ height: '100dvh' })],
    ['safe-top', probe({ height: '0', paddingTop: 'env(safe-area-inset-top, 0px)' })],
    ['safe-bottom', probe({ height: '0', paddingBottom: 'env(safe-area-inset-bottom, 0px)' })],
    ['standalone', String(standalone)],
    ['screen el', rectOf('.student-workout-screen')],
    ['footer', rectOf('.student-workout-footer')],
  ] as const;
};

export function WorkoutViewportDebug() {
  const [rows, setRows] = useState<ReadonlyArray<readonly [string, string | number]>>([]);

  useEffect(() => {
    const update = () => setRows(measure());
    update();
    const id = window.setInterval(update, 1000);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return (
    <div
      className="fixed left-1 z-[9999] rounded bg-background/80 px-2 py-1 font-mono text-foreground"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4px)', fontSize: 11, lineHeight: 1.3, pointerEvents: 'none' }}
      data-testid="workout-viewport-debug"
    >
      {rows.map(([k, v]) => (
        <div key={k}>{k}: {v}</div>
      ))}
    </div>
  );
}
