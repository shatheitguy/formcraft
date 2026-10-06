import { prisma } from './db';
import type { AccentKey } from './theme';
import { safeJson } from './utils';

export interface AppSettings {
  name: string;
  tagline: string;
  accent: AccentKey;
  /** Optional image URL replacing the default logo. */
  logoUrl: string;
  /** Base URL used in share links and notification messages, e.g. https://forms.example.com */
  publicUrl: string;
  /** Workspace's own footer branding, e.g. "© 2026 Acme Corp" (shown beside the fixed Powered-by credit). */
  footerText: string;
  /** Optional link for footerText. */
  footerUrl: string;
  /** Language for visitors without a preference (login page, new users). */
  defaultLanguage: string;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
}

export interface AllSettings {
  app: AppSettings;
  smtp: SmtpSettings;
  telegram: TelegramSettings;
}

export type SettingsSection = keyof AllSettings;

export const DEFAULT_SETTINGS: AllSettings = {
  app: {
    name: 'FormCraft',
    tagline: 'The developer-first, self-hosted form builder.',
    accent: 'indigo',
    logoUrl: '',
    publicUrl: '',
    footerText: '',
    footerUrl: '',
    defaultLanguage: 'en',
  },
  smtp: { enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from: '' },
  telegram: { enabled: false, botToken: '' },
};

let cache: AllSettings | null = null;

/** Forces the next getSettings() to re-read the database (e.g. after a restore). */
export const clearSettingsCache = () => {
  cache = null;
};

export async function getSettings(): Promise<AllSettings> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, safeJson<Record<string, unknown>>(r.value, {})]));
  cache = {
    app: { ...DEFAULT_SETTINGS.app, ...(map.get('app') as Partial<AppSettings>) },
    smtp: { ...DEFAULT_SETTINGS.smtp, ...(map.get('smtp') as Partial<SmtpSettings>) },
    telegram: { ...DEFAULT_SETTINGS.telegram, ...(map.get('telegram') as Partial<TelegramSettings>) },
  };
  return cache;
}

export async function saveSettings<K extends SettingsSection>(section: K, value: AllSettings[K]) {
  await prisma.setting.upsert({
    where: { key: section },
    create: { key: section, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
  cache = null;
}

/** Settings safe to send to the browser: secrets are replaced with presence flags. */
export function redactSettings(s: AllSettings) {
  return {
    app: s.app,
    smtp: { ...s.smtp, pass: '', hasPass: !!s.smtp.pass },
    telegram: { ...s.telegram, botToken: '', hasToken: !!s.telegram.botToken, tokenHint: s.telegram.botToken ? `…${s.telegram.botToken.slice(-4)}` : '' },
  };
}

export type RedactedSettings = ReturnType<typeof redactSettings>;
