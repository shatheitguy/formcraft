'use client';

import { AlertTriangle, Bell, Camera, KeyRound, Lock, Mail, Palette, Send, Trash2, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PasswordInput, StrengthMeter } from '@/components/auth/password-input';
import { ImageCrop, canCrop } from '@/components/image-crop';
import { useToast } from '@/components/toast';
import { Avatar } from '@/components/user-menu';
import { useI18n, useT } from '@/components/i18n';
import { ThemeSwitch, useLocalePref } from '@/components/preferences';
import { LOCALE_CODES, LOCALES, type Locale } from '@/lib/i18n';
import { Button, Segmented, Spinner, Switch } from '@/components/ui';
import { categoryStyle } from '@/lib/categories';
import { EVENT_INFO, NOTIFY_EVENTS, type ForcedNotify, type NotifyEvent } from '@/lib/notify-prefs';
import { ROLE_INFO, type Role } from '@/lib/roles';
import { cn, formatDate } from '@/lib/utils';
import { TelegramIcon } from './notification-settings';
import { WhatsAppIcon } from './whatsapp-card';
import { Field, SettingsCard, sendJson } from './settings-ui';
import { TwoFactorCard, type TwoFactorStatus } from './two-factor-card';

interface Profile {
  name: string;
  avatarUrl: string | null;
  username: string;
  email: string;
  role: Role;
  createdAt: string;
  notifyEmail: string;
  telegramChatId: string;
  whatsappNumber: string;
  whatsappNotifications: boolean;
  whatsappAttach: 'none' | 'pdf' | 'xlsx';
  emailNotifications: boolean;
  telegramNotifications: boolean;
  notifyAllForms: boolean;
  notifyFormIds: string[];
  notifyEvents: NotifyEvent[];
  /** Channels and kinds an admin requires (always on, can't be turned off here). */
  forcedNotify: ForcedNotify;
}

export function ProfileSettings({
  profile,
  forms,
  channels,
  isAdmin,
  twoFactor,
}: {
  profile: Profile;
  forms: { id: string; title: string; category: string }[];
  channels: { email: boolean; telegram: boolean; whatsapp: boolean };
  isAdmin: boolean;
  twoFactor: TwoFactorStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const { t, locale } = useI18n();

  const [account, setAccount] = useState({ name: profile.name, username: profile.username, email: profile.email });
  const forced = profile.forcedNotify;
  const [notify, setNotify] = useState({
    notifyEmail: profile.notifyEmail,
    telegramChatId: profile.telegramChatId,
    // Required channels and kinds show (and save) as on.
    emailNotifications: profile.emailNotifications || forced.channels.includes('email'),
    telegramNotifications: profile.telegramNotifications || forced.channels.includes('telegram'),
    whatsappNumber: profile.whatsappNumber,
    whatsappNotifications: profile.whatsappNotifications || forced.channels.includes('whatsapp'),
    notifyEvents: NOTIFY_EVENTS.filter((e) => profile.notifyEvents.includes(e) || forced.events.includes(e)),
    whatsappAttach: profile.whatsappAttach,
    notifyAllForms: profile.notifyAllForms,
    notifyFormIds: profile.notifyFormIds,
  });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState<string | null>(null);

  const accountDirty = account.name !== profile.name || account.username !== profile.username || account.email !== profile.email;
  const setN = <K extends keyof typeof notify>(k: K, v: (typeof notify)[K]) => setNotify((x) => ({ ...x, [k]: v }));
  const toggleEvent = (e: NotifyEvent, on: boolean) => setN('notifyEvents', NOTIFY_EVENTS.filter((x) => (x === e ? on : notify.notifyEvents.includes(x))));
  const shownEvents = NOTIFY_EVENTS.filter((e) => e !== 'system' || isAdmin);

  async function saveAccount() {
    setBusy('account');
    const r = await sendJson('/api/me', 'PATCH', account);
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('Profile updated'));
    router.refresh();
  }

  async function saveNotify() {
    setBusy('notify');
    const r = await sendJson('/api/me', 'PATCH', notify);
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('Notification preferences saved'));
    router.refresh();
  }

  async function changePassword() {
    if (pw.next !== pw.confirm) return toast(t('New passwords don’t match'), 'error');
    setBusy('password');
    const r = await sendJson<{ signedOut: number }>('/api/me/password', 'POST', { current: pw.current, next: pw.next });
    setBusy(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    setPw({ current: '', next: '', confirm: '' });
    toast(
      r.data.signedOut
        ? t(r.data.signedOut === 1 ? 'Password changed · signed out {n} other session' : 'Password changed · signed out {n} other sessions', { n: r.data.signedOut })
        : t('Password changed'),
    );
  }

  async function test(channel: 'email' | 'telegram' | 'whatsapp') {
    setBusy(`test-${channel}`);
    const r = await sendJson('/api/me/test', 'POST', { channel });
    setBusy(null);
    toast(r.ok ? t('Test notification sent!') : t(r.error!), r.ok ? 'success' : 'error');
  }

  return (
    <div className="space-y-6">
      {/* Identity banner */}
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <ProfilePhoto name={account.name} username={account.username} initial={profile.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-slate-900">{profile.name || profile.username}</div>
          <div className="text-sm text-slate-500">
            {t('@{username} · Member since {date}', { username: profile.username, date: formatDate(profile.createdAt, locale) })}
          </div>
        </div>
        <div className="text-end">
          <span className={cn('chip', ROLE_INFO[profile.role].tone)}>{t(ROLE_INFO[profile.role].label)}</span>
          <p className="mt-1 max-w-[240px] text-xs text-slate-500">{t(ROLE_INFO[profile.role].description)}</p>
        </div>
      </div>

      <PreferencesCard />

      <SettingsCard
        title={t('Account')}
        description={t('Your name, username and sign-in email.')}
        icon={<UserCircle2 />}
        footer={
          <Button variant="primary" onClick={saveAccount} loading={busy === 'account'} disabled={!accountDirty}>
            {t('Save profile')}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('Full name')}>
            <input className="input" value={account.name} onChange={(e) => setAccount((a) => ({ ...a, name: e.target.value }))} />
          </Field>
          <Field label={t('Username')} hint={t('Used to sign in.')}>
            <input className="input" value={account.username} onChange={(e) => setAccount((a) => ({ ...a, username: e.target.value.toLowerCase() }))} />
          </Field>
          <Field label={t('Email')}>
            <input className="input" type="email" value={account.email} onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))} dir="ltr" />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('Password')}
        description={t('Changing your password signs you out on all other devices.')}
        icon={<KeyRound />}
        footer={
          <Button variant="primary" onClick={changePassword} loading={busy === 'password'} disabled={!pw.current || !pw.next || !pw.confirm}>
            {t('Update password')}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t('Current password')}>
            <PasswordInput value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
          </Field>
          <Field label={t('New password')}>
            <PasswordInput value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} autoComplete="new-password" />
            <StrengthMeter password={pw.next} />
          </Field>
          <Field label={t('Confirm new password')}>
            <PasswordInput
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
              className={cn(pw.confirm && pw.confirm !== pw.next && 'input-error')}
            />
            {pw.confirm && pw.confirm !== pw.next && <p className="mt-1.5 text-xs text-rose-600">{t('Passwords don’t match.')}</p>}
          </Field>
        </div>
      </SettingsCard>

      <TwoFactorCard status={twoFactor} emailAvailable={channels.email} email={profile.email} />

      <SettingsCard
        title={t('Notifications')}
        description={t('Get alerted when forms you have access to receive new responses.')}
        icon={<Bell />}
        footer={
          <Button variant="primary" onClick={saveNotify} loading={busy === 'notify'}>
            {t('Save preferences')}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Channel
            icon={<Mail className="h-4 w-4" />}
            title={t('Email')}
            enabled={notify.emailNotifications}
            onToggle={(v) => setN('emailNotifications', v)}
            forced={forced.channels.includes('email')}
            available={channels.email}
            isAdmin={isAdmin}
            onTest={() => test('email')}
            testing={busy === 'test-email'}
          >
            <Field label={t('Notification email')} hint={t('Leave empty to use {email}.', { email: profile.email })}>
              <input className="input" type="email" value={notify.notifyEmail} onChange={(e) => setN('notifyEmail', e.target.value)} placeholder={profile.email} dir="ltr" />
            </Field>
          </Channel>
          <Channel
            icon={<TelegramIcon className="h-4 w-4" />}
            title={t('Telegram')}
            enabled={notify.telegramNotifications}
            onToggle={(v) => setN('telegramNotifications', v)}
            forced={forced.channels.includes('telegram')}
            missingTarget={forced.channels.includes('telegram') && !notify.telegramChatId.trim() ? t('Your admin requires Telegram alerts — add your Telegram chat ID.') : undefined}
            available={channels.telegram}
            isAdmin={isAdmin}
            onTest={() => test('telegram')}
            testing={busy === 'test-telegram'}
            testDisabled={!profile.telegramChatId}
          >
            <Field label={t('Telegram chat ID')} hint={t('Start a chat with the workspace bot, then get your ID from {bot}. Save before testing.', { bot: '@userinfobot' })}>
              <input className="input" value={notify.telegramChatId} onChange={(e) => setN('telegramChatId', e.target.value)} placeholder="123456789" dir="ltr" />
            </Field>
          </Channel>
          <Channel
            icon={<WhatsAppIcon className="h-4 w-4" />}
            title={t('WhatsApp')}
            enabled={notify.whatsappNotifications}
            onToggle={(v) => setN('whatsappNotifications', v)}
            forced={forced.channels.includes('whatsapp')}
            missingTarget={forced.channels.includes('whatsapp') && !notify.whatsappNumber.trim() ? t('Your admin requires WhatsApp alerts — add your WhatsApp number.') : undefined}
            available={channels.whatsapp}
            isAdmin={isAdmin}
            onTest={() => test('whatsapp')}
            testing={busy === 'test-whatsapp'}
            testDisabled={!profile.whatsappNumber}
          >
            <Field label={t('WhatsApp number')} hint={t('With country code, e.g. +971 50 123 4567. Save before testing.')}>
              <input className="input" value={notify.whatsappNumber} onChange={(e) => setN('whatsappNumber', e.target.value)} placeholder="+971 50 123 4567" dir="ltr" inputMode="tel" />
            </Field>
            <div className="mt-3">
              <span className="label">{t('Attach the response as')}</span>
              <Segmented
                value={notify.whatsappAttach}
                onChange={(v) => setN('whatsappAttach', v)}
                options={[
                  { value: 'none', label: t('Text only') },
                  { value: 'pdf', label: 'PDF' },
                  { value: 'xlsx', label: t('Excel') },
                ]}
              />
            </div>
          </Channel>
        </div>

        <div className="mt-6">
          <span className="label">{t('What to notify me about')}</span>
          <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {shownEvents.map((e) => {
              const locked = forced.events.includes(e);
              return (
                <div key={e} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">{t(EVENT_INFO[e].label)}</div>
                    <div className="text-xs text-slate-600">{t(EVENT_INFO[e].text)}</div>
                    {locked && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Lock className="h-3 w-3 shrink-0" /> {t('Required by your admin')}
                      </div>
                    )}
                  </div>
                  <Switch checked={locked || notify.notifyEvents.includes(e)} onChange={(v) => toggleEvent(e, v)} disabled={locked} label={t(EVENT_INFO[e].label)} />
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{t('Applies to the bell and to the email, Telegram and WhatsApp alerts you turned on above.')}</p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="label !mb-0">{t('Notify me about')}</span>
            <Segmented
              value={notify.notifyAllForms ? 'all' : 'some'}
              onChange={(v) => setN('notifyAllForms', v === 'all')}
              options={[
                { value: 'all', label: t('All my forms ({n})', { n: forms.length }) },
                { value: 'some', label: t('Selected forms') },
              ]}
            />
          </div>
          {!notify.notifyAllForms && (
            <div className="scrollbar-thin grid max-h-64 gap-1 overflow-y-auto rounded-lg p-1 ring-1 ring-slate-200 sm:grid-cols-2">
              {forms.map((f) => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                    checked={notify.notifyFormIds.includes(f.id)}
                    onChange={() =>
                      setN('notifyFormIds', notify.notifyFormIds.includes(f.id) ? notify.notifyFormIds.filter((x) => x !== f.id) : [...notify.notifyFormIds, f.id])
                    }
                  />
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', categoryStyle(f.category).dot)} />
                  <span className="truncate text-slate-700">{f.title}</span>
                </label>
              ))}
              {forms.length === 0 && <p className="col-span-2 px-2 py-4 text-center text-xs text-slate-400">{t('You don’t have access to any forms yet.')}</p>}
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}

function PreferencesCard() {
  const t = useT();
  const [locale, setLocale] = useLocalePref();
  return (
    <SettingsCard title={t('Preferences')} description={t('Language and appearance, saved to your account.')} icon={<Palette />}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={t('Language')}>
          <select className="input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            {LOCALE_CODES.map((l) => (
              <option key={l} value={l}>
                {LOCALES[l].native}
                {l !== 'en' ? ` — ${LOCALES[l].label}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Theme')} hint={t('System follows your device’s light or dark setting.')}>
          <ThemeSwitch />
        </Field>
      </div>
    </SettingsCard>
  );
}

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Avatar with click-to-upload and remove; saves immediately. */
function ProfilePhoto({ name, username, initial }: { name: string; username: string; initial: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null); // picked photo waiting in the crop dialog

  // PNG/JPG/WebP open the crop dialog first (square, round preview); GIFs upload as-is.
  function pick(file: File | undefined) {
    if (file && canCrop(file) && file.size <= 25 * 1024 * 1024) return setPending(file);
    upload(file);
  }
  const closeCrop = () => {
    setPending(null);
    if (input.current) input.current.value = '';
  };

  async function save(next: string | null) {
    const r = await sendJson('/api/me', 'PATCH', { avatarUrl: next ?? '' });
    if (!r.ok) throw new Error(r.error);
    setUrl(next);
    router.refresh();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return toast(t('Use a PNG, JPG, GIF or WebP image'), 'error');
    if (file.size > 2 * 1024 * 1024) return toast(t('Photos must be 2 MB or smaller'), 'error');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('purpose', 'avatar');
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      await save(json.url);
      toast(t('Profile photo updated'));
    } catch (e) {
      toast(t(e instanceof Error && e.message ? e.message : 'Upload failed'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await save(null);
      toast(t('Profile photo removed'));
    } catch (e) {
      toast(t(e instanceof Error && e.message ? e.message : 'Could not remove photo'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input ref={input} type="file" accept={PHOTO_TYPES.join(',')} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <ImageCrop
        file={pending}
        mode="avatar"
        onCancel={closeCrop}
        onDone={(f) => {
          closeCrop();
          upload(f);
        }}
        onSkip={() => {
          const f = pending;
          closeCrop();
          upload(f ?? undefined);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30"
        title={t('Change profile photo')}
        aria-label={t('Change profile photo')}
      >
        <Avatar name={name} fallback={username} src={url} className="h-16 w-16 text-lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-onaccent opacity-0 transition group-hover:opacity-100">
          {busy ? <Spinner className="text-onaccent" /> : <Camera className="h-5 w-5" />}
        </span>
      </button>
      <div className="flex flex-col gap-1">
        <Button size="xs" onClick={() => input.current?.click()} disabled={busy}>
          <Camera className="h-3.5 w-3.5" /> {url ? t('Change photo') : t('Upload photo')}
        </Button>
        {url && (
          <Button size="xs" variant="ghost" onClick={remove} disabled={busy} className="!text-rose-600">
            <Trash2 className="h-3.5 w-3.5" /> {t('Remove')}
          </Button>
        )}
      </div>
    </div>
  );
}

function Channel({
  icon,
  title,
  enabled,
  onToggle,
  forced,
  missingTarget,
  available,
  isAdmin,
  onTest,
  testing,
  testDisabled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  /** Required by an admin: shown on and locked. */
  forced?: boolean;
  /** Required but there's nowhere to send it yet. */
  missingTarget?: string;
  available: boolean;
  isAdmin: boolean;
  onTest: () => void;
  testing: boolean;
  testDisabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={cn('min-w-0 rounded-xl border p-4 transition', enabled || forced ? 'border-brand-200 bg-brand-50/30' : 'border-slate-200')}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 ring-1 ring-slate-200">{icon}</span>
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <div className="ms-auto">
          <Switch checked={enabled || !!forced} onChange={onToggle} disabled={forced} label={t('{channel} notifications', { channel: title })} />
        </div>
      </div>
      {forced && (
        <p className="-mt-1.5 mb-3 flex items-center gap-1 text-xs text-slate-500">
          <Lock className="h-3 w-3 shrink-0" /> {t('Required by your admin')}
        </p>
      )}
      {missingTarget && (
        <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-300" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
          <span>{missingTarget}</span>
        </p>
      )}
      {children}
      {!available ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {t('{channel} delivery isn’t configured for this workspace yet.', { channel: title })}{' '}
            {isAdmin ? (
              <Link href="/settings/notifications" className="font-semibold underline">
                {t('Set it up')}
              </Link>
            ) : (
              t('Ask an admin to set it up.')
            )}
          </span>
        </p>
      ) : (
        <Button size="xs" variant="ghost" className="mt-2" onClick={onTest} loading={testing} disabled={testDisabled}>
          <Send className="h-3.5 w-3.5" /> {t('Send test')}
        </Button>
      )}
    </div>
  );
}
