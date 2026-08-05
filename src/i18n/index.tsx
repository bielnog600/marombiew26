import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { ptToEn, patternRules } from './dictionary';

export type AppLanguage = 'pt' | 'en';

/** Detecta o idioma do dispositivo: qualquer idioma que não seja português vira inglês. */
export const detectDeviceLanguage = (): AppLanguage => {
  if (typeof navigator === 'undefined') return 'pt';
  const langs = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  const primary = (langs[0] || 'pt').toLowerCase();
  return primary.startsWith('pt') ? 'pt' : 'en';
};

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

const lookupTable = new Map<string, string>();
Object.entries(ptToEn).forEach(([pt, en]) => {
  lookupTable.set(normalize(pt).toLowerCase(), en);
});

const applyCase = (source: string, translated: string) => {
  if (source === source.toUpperCase() && /[A-ZÀ-Ý]/.test(source)) return translated.toUpperCase();
  return translated;
};

/** Traduz um texto em PT-BR para inglês; devolve o original quando não há tradução. */
export const translateText = (value: string, lang: AppLanguage): string => {
  if (lang === 'pt' || !value) return value;
  const trimmed = normalize(value);
  if (!trimmed) return value;

  // Preserva pontuação final e espaços em volta
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const punct = trimmed.match(/[.!?:,;…]+$/)?.[0] ?? '';
  const core = punct ? trimmed.slice(0, trimmed.length - punct.length).trim() : trimmed;

  const direct = lookupTable.get(core.toLowerCase());
  if (direct) return leading + applyCase(core, direct) + punct + trailing;

  for (const [pattern, replacement] of patternRules) {
    if (pattern.test(core)) {
      return leading + core.replace(pattern, replacement) + punct + trailing;
    }
  }
  return value;
};

interface LanguageContextValue {
  language: AppLanguage;
  t: (value: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({ language: 'pt', t: (v) => v });

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const language = useMemo(detectDeviceLanguage, []);
  useEffect(() => {
    document.documentElement.lang = language === 'en' ? 'en' : 'pt-BR';
  }, [language]);
  const value = useMemo<LanguageContextValue>(
    () => ({ language, t: (v: string) => translateText(v, language) }),
    [language],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useContext(LanguageContext).t;
