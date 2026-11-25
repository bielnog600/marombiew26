import { useEffect } from 'react';
import { useLanguage, translateText } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
/** Números, cargas, tempos e faixas ("30s", "12-15", "7,25 kg", "1/11") nunca passam pelo dicionário. */
export const isNumericLike = (text: string) => /^[\s\d.,:;/×x+\-–—%°'"()]*(s|seg|min|kg|g|ml|kcal|rpm|reps?)?[\s\d.,:;/×x+\-–—%°'"()]*$/i.test(text.trim());
const ATTRS = ['placeholder', 'aria-label', 'title'];

/**
 * Camada de tradução automática da interface do aluno.
 * Percorre os textos estáticos em português e aplica o dicionário PT->EN
 * quando o idioma do dispositivo não é português.
 */
const AutoTranslate = () => {
  const { language } = useLanguage();
  const { role } = useAuth();

  useEffect(() => {
    if (language !== 'en' || role === 'admin') return;

    const translateNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return;
      if (parent.closest('[data-no-translate]')) return;
      const original = node.nodeValue ?? '';
      if (!original.trim() || isNumericLike(original)) return;
      const next = translateText(original, 'en');
      if (next !== original) node.nodeValue = next;
    };

    const translateAttrs = (el: Element) => {
      if (el.closest('[data-no-translate]')) return;
      for (const attr of ATTRS) {
        const original = el.getAttribute(attr);
        if (!original || isNumericLike(original)) continue;
        const next = translateText(original, 'en');
        if (next !== original) el.setAttribute(attr, next);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateNode(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const el = root as Element;
      if (SKIP_TAGS.has(el.tagName)) return;
      translateAttrs(el);
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const texts: Text[] = [];
      while (walker.nextNode()) texts.push(walker.currentNode as Text);
      texts.forEach(translateNode);
      el.querySelectorAll('[placeholder],[aria-label],[title]').forEach(translateAttrs);
    };

    try { walk(document.body); } catch { /* ignora */ }

    let frame = 0;
    const pending: Node[] = [];
    const flush = () => {
      frame = 0;
      const nodes = pending.splice(0, pending.length);
      // Tradução nunca pode quebrar a tela: um nó problemático é só ignorado.
      for (const n of nodes) {
        try { if (n.isConnected) walk(n); } catch { /* ignora */ }
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') pending.push(mutation.target);
        else mutation.addedNodes.forEach((n) => pending.push(n));
      }
      if (pending.length && !frame) frame = requestAnimationFrame(flush);
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [language, role]);

  return null;
};

export default AutoTranslate;
