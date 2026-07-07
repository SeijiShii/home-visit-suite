// desktop/frontend/src/contexts/I18nContext.tsx からの移植。
// Wails 版の SettingsService 依存を LocaleStore インターフェースに置き換え、
// LinkSelf TS アダプタ完成後に永続化を注入できるようにしている。
// 省略時は localStorage ミラーのみで動作する。

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Locales, Translations } from "../i18n/i18n-types";
import {
  getLocale,
  setLocale as setI18nLocale,
  t as getTranslations,
} from "../i18n/i18n-util";

/** ロケールの永続化ストア（LinkSelf TS アダプタ等を注入する）。 */
export interface LocaleStore {
  getLocale(): Promise<string>;
  setLocale(locale: string): Promise<void>;
}

const LOCALE_MIRROR_KEY = "ui.locale.mirror";
const LEGACY_LOCALE_KEYS = ["locale", "ui.locale"]; // 旧実装で使われた可能性のあるキー

function isLocale(v: unknown): v is Locales {
  return v === "ja" || v === "en";
}

function readMirroredLocale(): Locales | null {
  try {
    const v = localStorage.getItem(LOCALE_MIRROR_KEY);
    if (isLocale(v)) return v;
    for (const k of LEGACY_LOCALE_KEYS) {
      const legacy = localStorage.getItem(k);
      if (isLocale(legacy)) return legacy;
    }
  } catch {
    // ignore
  }
  return null;
}

function writeMirroredLocale(locale: Locales): void {
  try {
    localStorage.setItem(LOCALE_MIRROR_KEY, locale);
    // 旧キーが残っていたら削除
    for (const k of LEGACY_LOCALE_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

interface I18nContextValue {
  t: Translations;
  locale: Locales;
  setLocale: (locale: Locales) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  /** 永続化ストア。省略時は localStorage ミラーのみ。 */
  store?: LocaleStore;
}

export function I18nProvider({ children, store }: I18nProviderProps) {
  // 起動直後: localStorage ミラーがあれば即座に採用、なければ util のデフォルト (ja)
  const [locale, setLocaleState] = useState<Locales>(() => {
    const mirrored = readMirroredLocale();
    if (mirrored) {
      setI18nLocale(mirrored);
      return mirrored;
    }
    return getLocale();
  });

  // store が与えられた場合のみ、非同期で永続化ストアから上書き
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    store
      .getLocale()
      .then((stored) => {
        if (cancelled) return;
        if (isLocale(stored) && stored !== locale) {
          setI18nLocale(stored);
          setLocaleState(stored);
          writeMirroredLocale(stored);
        } else if (!stored) {
          // ストアに未保存 → 現在値（ミラー or デフォルト）を初回移行として書き込む
          const current = readMirroredLocale() ?? locale;
          void store.setLocale(current);
          writeMirroredLocale(current);
        }
      })
      .catch(() => {
        // 取得失敗時は現在の locale を維持
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const setLocale = useCallback(
    async (newLocale: Locales) => {
      setI18nLocale(newLocale);
      setLocaleState(newLocale);
      writeMirroredLocale(newLocale);
      if (store) {
        try {
          await store.setLocale(newLocale);
        } catch {
          // 永続化失敗時もローカル state は維持
        }
      }
    },
    [store],
  );

  const value: I18nContextValue = {
    t: getTranslations(),
    locale,
    setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
