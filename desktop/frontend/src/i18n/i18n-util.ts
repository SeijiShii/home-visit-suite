import type { Locales, Translations } from './i18n-types';
import ja from './ja';
import en from './en';

const translations: Record<Locales, Translations> = { ja, en };

let currentLocale: Locales = 'ja';

export function getLocale(): Locales {
  return currentLocale;
}

export function setLocale(locale: Locales): void {
  currentLocale = locale;
}

export function t(): Translations {
  return translations[currentLocale];
}
