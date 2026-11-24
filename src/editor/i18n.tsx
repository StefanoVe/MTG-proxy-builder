import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { resolveLocale, translate } from '../shared/i18n.js';
import type { Locale, Translate } from '../shared/i18n.js';

const preferenceKey = 'interface-language';
type I18n = { locale: Locale; t: Translate; setLocale: (locale: Locale) => void };
const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale | undefined>(() => {
    const saved = localStorage.getItem(preferenceKey);
    return saved === 'it' || saved === 'en' ? saved : undefined;
  });

  useEffect(() => {
    if (locale) return;
    let active = true;
    void window.proxy.getLocale().catch(() => resolveLocale(navigator.languages)).then(systemLocale => {
      if (active) setLocale(systemLocale);
    });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    if (!locale) return;
    document.documentElement.lang = locale;
    localStorage.setItem(preferenceKey, locale);
    void window.proxy.setLocale(locale);
  }, [locale]);

  const value = useMemo<I18n | null>(() => locale ? ({
    locale, setLocale, t: (key, values) => translate(locale, key, values)
  }) : null, [locale]);

  return value && <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
