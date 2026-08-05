import { useEffect } from 'react';
import { useLanguage, translateText } from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA']);
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
      if (!original.trim()) return;
      const next = translateText(original, 'en');
      if (next !== original) node.nodeValue = next;
    };

    const translateAttrs = (el: Element) => {
      if (el.closest('[data-no-translate]')) return;
      for (const attr of ATTRS) {
        const original = el.getAttribute(attr);
        if (!original) continue;
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

    walk(document.body);

    let frame = 0;
    const pending: Node[] = [];
    const flush = () => {
      frame = 0;
      const nodes = pending.splice(0, pending.length);
      nodes.forEach(walk);
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
