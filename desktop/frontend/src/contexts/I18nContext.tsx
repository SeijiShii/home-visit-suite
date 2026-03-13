import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Locales, Translations } from '../i18n/i18n-types';
import {
  getLocale,
  setLocale as setI18nLocale,
  t as getTranslations,
} from '../i18n/i18n-util';

interface I18nContextValue {
  t: Translations;
  locale: Locales;
  setLocale: (locale: Locales) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locales>(getLocale());

  const setLocale = useCallback((newLocale: Locales) => {
    setI18nLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  const value: I18nContextValue = {
    t: getTranslations(),
    locale,
    setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
