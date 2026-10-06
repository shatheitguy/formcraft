'use client';

import { Check, Globe, Palette, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/icons';
import { ImageUpload } from '@/components/image-upload';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, Switch } from '@/components/ui';
import type { AppSettings } from '@/lib/settings';
import { POWERED_BY_NAME } from '@/lib/brand';
import { LOCALE_CODES, LOCALES } from '@/lib/i18n';
import { ACCENTS, ACCENT_KEYS, accentCss, type AccentKey } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Field, SettingsCard, ToggleField, sendJson } from './settings-ui';

const ACCENT_NAMES: Record<AccentKey, string> = {
  indigo: 'Indigo',
  violet: 'Violet',
  blue: 'Blue',
  teal: 'Teal',
  emerald: 'Emerald',
  rose: 'Rose',
  wine: 'Wine red',
  yellow: 'Yellow',
  orange: 'Orange',
  slate: 'Slate',
};

export function GeneralSettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true);
    const r = await sendJson('/api/admin/settings', 'PUT', { section: 'app', value: s });
    setSaving(false);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('Customization saved'));
    router.refresh();
  }

  const footer = (
    <>
      {dirty && (
        <Button variant="ghost" onClick={() => setS(initial)}>
          <RotateCcw className="h-4 w-4" /> {t('Reset')}
        </Button>
      )}
      <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
        {t('Save changes')}
      </Button>
    </>
  );

  return (
    <>
      {/* Live preview of the accent before saving */}
      <style dangerouslySetInnerHTML={{ __html: accentCss(s.accent) }} />
    <div className="space-y-6">

      <SettingsCard
        title={t('Branding')}
        description={t('How your workspace appears in the dashboard, login screen and public forms.')}
        icon={<Palette />}
        footer={footer}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t('Application name')}>
            <input className="input" value={s.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label={t('Tagline')} hint={t('Shown on the login screen.')}>
            <input className="input" value={s.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} />
          </Field>
          <Field label={t('Default language')} hint={t('Used on the login screen and for people who haven’t picked a language.')}>
            <select className="input" value={s.defaultLanguage ?? 'en'} onChange={(e) => set('defaultLanguage', e.target.value)}>
              {LOCALE_CODES.map((l) => (
                <option key={l} value={l}>
                  {LOCALES[l].native}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('Workspace logo')} hint={t('Optional. A square image works best. Remove it to use the default logo.')} className="md:col-span-2">
            <div className="max-w-xs">
              <ImageUpload value={s.logoUrl} onChange={(v) => set('logoUrl', v)} />
            </div>
          </Field>
        </div>

        <div className="mt-6">
          <div className="label">{t('Accent color')}</div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => set('accent', k as AccentKey)}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border py-1.5 ps-1.5 pe-3 text-sm font-medium capitalize transition',
                  s.accent === k ? 'border-slate-900 bg-white text-slate-900 shadow-sm' : 'border-slate-200 text-slate-600 hover:border-slate-300',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md text-onaccent" style={{ background: `linear-gradient(135deg, ${ACCENTS[k][5]}, ${ACCENTS[k][7]})` }}>
                  {s.accent === k && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                {t(ACCENT_NAMES[k] ?? k)}
              </button>
            ))}
          </div>
        </div>

        {/* Mini preview */}
        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
          <div className="label !mb-3">{t('Preview')}</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-card ring-1 ring-slate-200">
              <Logo className="h-6 w-6" src={s.logoUrl || undefined} />
              <span className="text-sm font-bold text-slate-900">{s.name || 'FormCraft'}</span>
            </div>
            <Button variant="primary">{t('Primary button')}</Button>
            <span className="chip bg-brand-50 text-brand-700 ring-brand-200">{t('Badge')}</span>
            <span className="text-sm font-medium text-brand-600">{t('Link text')}</span>
            <Switch checked onChange={() => {}} label={t('Preview switch')} />
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title={t('Public access')} description={t('Used for share links and links inside email/Telegram notifications.')} icon={<Globe />} footer={footer}>
        <div className="space-y-4">
          <Field label={t('Public URL')} hint={t('e.g. {url} — leave empty to use the address you’re browsing from.', { url: 'https://forms.example.com' })}>
            <input className="input" value={s.publicUrl} onChange={(e) => set('publicUrl', e.target.value)} placeholder="https://forms.example.com" dir="ltr" />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('Footer branding')} hint={t('Your own text in the footer of every page and form, e.g. your company name.')}>
              <input className="input" value={s.footerText ?? ''} maxLength={120} onChange={(e) => set('footerText', e.target.value)} placeholder={t('© {year} Your Company', { year: new Date().getFullYear() })} />
            </Field>
            <Field label={t('Footer branding link')} hint={t('Optional. Your text links here in a new tab.')}>
              <input className="input" value={s.footerUrl ?? ''} onChange={(e) => set('footerUrl', e.target.value)} placeholder="https://your-company.com" dir="ltr" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">{t('“Powered by {name}” is always shown next to your branding.', { name: POWERED_BY_NAME })}</p>
        </div>
      </SettingsCard>
    </div>
    </>
  );
}
