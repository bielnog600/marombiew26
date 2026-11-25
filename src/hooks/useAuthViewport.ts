import { useEffect, useRef } from 'react';

/** Mantém as telas de acesso na viewport visível, inclusive quando o teclado abre. */
export function useAuthViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    const viewport = window.visualViewport;

    const ajustar = () => {
      const altura = Math.round(viewport?.height ?? window.innerHeight);
      elemento.style.setProperty('--auth-viewport-height', `${altura}px`);
      elemento.style.setProperty('--auth-viewport-top', `${Math.round(viewport?.offsetTop ?? 0)}px`);
      elemento.classList.toggle('teclado-aberto', !!viewport && viewport.height < window.innerHeight - 120);
    };

    const manterCampoVisivel = (event: FocusEvent) => {
      const campo = event.target;
      if (!(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement || campo instanceof HTMLTextAreaElement)) return;
      window.setTimeout(() => {
        if (document.activeElement !== campo || !viewport) return;
        const caixa = campo.getBoundingClientRect();
        const topo = viewport.offsetTop + 12;
        const base = viewport.offsetTop + viewport.height - 12;
        if (caixa.top < topo || caixa.bottom > base) campo.scrollIntoView({ block: 'center', behavior: 'auto' });
      }, 300);
    };

    // Trava o documento só nas telas de acesso: o body tem padding de safe-area que somaria altura à tela.
    document.documentElement.classList.add('auth-screen-open');
    ajustar();
    viewport?.addEventListener('resize', ajustar);
    viewport?.addEventListener('scroll', ajustar);
    elemento.addEventListener('focusin', manterCampoVisivel);
    return () => {
      viewport?.removeEventListener('resize', ajustar);
      viewport?.removeEventListener('scroll', ajustar);
      elemento.removeEventListener('focusin', manterCampoVisivel);
      document.documentElement.classList.remove('auth-screen-open');
    };
  }, []);

  return ref;
}
