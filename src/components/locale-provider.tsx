"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  detectInitialLocale,
  LOCALE_LABELS,
  persistLocale,
  SUPPORTED_LOCALES,
  t,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

type LocaleApi = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleApi | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = detectInitialLocale();
    setLocaleState(initial);
    persistLocale(initial);
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const translate = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      t(locale, key, vars),
    [locale]
  );

  const api = useMemo(
    () => ({ locale, setLocale, t: translate }),
    [locale, setLocale, translate]
  );

  if (!ready) {
    return (
      <LocaleContext.Provider value={api}>{children}</LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={api}>{children}</LocaleContext.Provider>
  );
}

export function useI18n(): LocaleApi {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => t(DEFAULT_LOCALE, key, vars),
    };
  }
  return ctx;
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t: tr } = useI18n();
  return (
    <div
      className={`inline-flex items-center rounded-lg border border-border bg-surface-2 p-0.5 text-xs ${className}`}
      role="group"
      aria-label={tr("language")}
    >
      {SUPPORTED_LOCALES.map((code) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            className={`rounded-md px-2 py-1 font-medium transition ${
              active
                ? "bg-brand-soft text-white"
                : "text-muted hover:text-zinc-200"
            }`}
            aria-pressed={active}
          >
            {LOCALE_LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
