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

export interface WhatsAppSettings {
  enabled: boolean;
  /** Digits only, e.g. "971" — used for numbers typed without a country code. */
  defaultCountryCode: string;
}

export type BackupFrequency = 'hourly' | 'daily' | 'weekly';

export interface BackupSettings {
  /** Automatic scheduled backups of all forms, responses, users and settings. */
  enabled: boolean;
  frequency: BackupFrequency;
  /** "HH:MM", server local time. Daily/weekly: the time of day; hourly: only the minute is used. */
  time: string;
  /** 0 = Sunday … 6 = Saturday (weekly only). */
  weekday: number;
  /** How many automatic backups to keep (1–365). */
  keep: number;
  /** Include uploaded images (logos, covers). */
  includeUploads: boolean;
}

/** Who must use two-factor sign-in: nobody (users choose), admins only, or everyone. */
export type TwoFactorPolicy = 'off' | 'admins' | 'all';

export interface SecuritySettings {
  require2fa: TwoFactorPolicy;
}

export interface AllSettings {
  app: AppSettings;
  smtp: SmtpSettings;
  telegram: TelegramSettings;
  whatsapp: WhatsAppSettings;
  backup: BackupSettings;
  security: SecuritySettings;
}

export type SettingsSection = keyof AllSettings;

export const DEFAULT_SETTINGS: AllSettings = {
  app: {
    name: 'FormCraft',
    tagline: 'The developer-first, self-hosted form builder.',
    accent: 'wine',
    logoUrl: '',
    publicUrl: '',
    footerText: '',
    footerUrl: '',
    defaultLanguage: 'en',
  },
  smtp: { enabled: false, host: '', port: 587, secure: false, user: '', pass: '', from: '' },
  telegram: { enabled: false, botToken: '' },
  whatsapp: { enabled: false, defaultCountryCode: '' },
  // On by default so data is protected out of the box.
  backup: { enabled: true, frequency: 'daily', time: '02:00', weekday: 0, keep: 14, includeUploads: true },
  security: { require2fa: 'off' },
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
    whatsapp: { ...DEFAULT_SETTINGS.whatsapp, ...(map.get('whatsapp') as Partial<WhatsAppSettings>) },
    backup: { ...DEFAULT_SETTINGS.backup, ...(map.get('backup') as Partial<BackupSettings>) },
    security: { ...DEFAULT_SETTINGS.security, ...(map.get('security') as Partial<SecuritySettings>) },
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
    whatsapp: s.whatsapp,
    backup: s.backup,
    security: s.security,
  };
}

export type RedactedSettings = ReturnType<typeof redactSettings>;
