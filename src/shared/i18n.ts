import { messages } from './messages.ts';

export const locales = ['it', 'en'] as const;
export type Locale = typeof locales[number];
export type MessageKey = keyof typeof messages;
type MessageValues = Readonly<Record<string, string | number>>;

export function resolveLocale(languages: readonly string[], fallback: Locale = 'en'): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/, 1)[0];
    if (base === 'it' || base === 'en') return base;
  }
  return fallback;
}

export function translate(locale: Locale, key: MessageKey, values: MessageValues = {}): string {
  return messages[key][locale === 'it' ? 0 : 1].replace(/\{(\w+)\}/g, (token, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : token);
}

export type Translate = (key: MessageKey, values?: MessageValues) => string;

export class LocalizedError extends Error {
  readonly key: MessageKey;
  readonly values?: MessageValues;

  constructor(key: MessageKey, values?: MessageValues) {
    super(translate('it', key, values));
    this.key = key;
    this.values = values;
  }
}

export function errorMessage(error: unknown, locale: Locale): string {
  if (error instanceof LocalizedError) return translate(locale, error.key, error.values);
  return (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');
}
