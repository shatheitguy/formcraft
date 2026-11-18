'use client';

import { AlertTriangle, Bell, ChevronDown, Filter, Mail, MessageCircle, Plus, Send, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import {
  FIXED_PLACEHOLDERS,
  greetingField,
  isConditionField,
  MAX_ALERT_RECIPIENTS,
  MAX_MESSAGE,
  MAX_SUBJECT,
  recipientLooksValid,
} from '@/lib/form-alerts-shared';
import type { AlertChannel, FormAlertRecipient, FormConfirm, FormField, FormSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PillRow, Section, ToggleRow } from './inspector';

type Status = { channels: Record<AlertChannel, boolean>; isAdmin: boolean; me: { email: string; whatsapp: string } };

const CHANNEL_NAME: Record<AlertChannel, string> = { email: 'Email', whatsapp: 'WhatsApp', telegram: 'Telegram' };
const CHANNEL_NEEDS: Record<AlertChannel, string> = {
  email: 'Email needs SMTP set up.',
  telegram: 'Telegram needs a bot token.',
  whatsapp: 'WhatsApp needs to be linked and turned on.',
};
const TO_PLACEHOLDER: Record<AlertChannel, string> = { email: 'name@example.com', whatsapp: '+971 50 123 4567', telegram: '123456789 / -100… / @channel' };

/** Per-form notifications: extra recipients, an optional condition, daily summary, and a message to the respondent. */
export function NotificationsSection({
  formId,
  fields,
  settings,
  onSettings,
}: {
  formId: string;
  fields: FormField[];
  settings: FormSettings;
  onSettings: (patch: Partial<FormSettings>) => void;
}) {
  const t = useT();
  const alerts = settings.alerts ?? [];
  const confirm = settings.confirm ?? {};
  const active = alerts.length + (confirm.whatsapp?.enabled ? 1 : 0) + (confirm.email?.enabled ? 1 : 0);
  const [open, setOpen] = useState(active > 0);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!open || status) return;
    fetch(`/api/forms/${formId}/alerts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});
  }, [open, status, formId]);

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-start text-sm font-semibold text-slate-900">
        <Bell className="h-4 w-4 shrink-0 text-brand-600" />
        <span className="flex-1">{t('Notifications')}</span>
        {active > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{t('{n} on', { n: active })}</span>}
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            {t('Team members choose their own alerts in My profile → Notifications. Use this for people outside FormCraft and for respondents.')}{' '}
            <Link href="/settings/profile" className="font-medium text-brand-700 hover:underline">
              {t('My profile')}
            </Link>
          </p>
          <AlertsGroup fields={fields} settings={settings} onSettings={onSettings} status={status} />
          <ConfirmGroup formId={formId} fields={fields} confirm={confirm} onConfirm={(c) => onSettings({ confirm: c })} status={status} />
        </div>
      )}
    </div>
  );
}

function Group({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="text-xs text-slate-500">{text}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** "Email needs SMTP set up. Set it up" — only when the workspace channel isn't working. */
function Unavailable({ channel, status }: { channel: AlertChannel; status: Status | null }) {
  const t = useT();
  if (!status || status.channels[channel]) return null;
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        {t(CHANNEL_NEEDS[channel])}{' '}
        {status.isAdmin ? (
          <Link href="/settings/notifications" className="font-semibold underline">
            {t('Settings → Notifications')}
          </Link>
        ) : (
          t('Ask an admin to set it up.')
        )}
      </span>
    </p>
  );
}

/* ------------------------------ 1. alerts ------------------------------ */

function AlertsGroup({ fields, settings, onSettings, status }: { fields: FormField[]; settings: FormSettings; onSettings: (patch: Partial<FormSettings>) => void; status: Status | null }) {
  const t = useT();
  const alerts = settings.alerts ?? [];
  const setAlerts = (list: FormAlertRecipient[]) => onSettings({ alerts: list.length ? list : undefined });
  const patch = (i: number, p: Partial<FormAlertRecipient>) => setAlerts(alerts.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const condFields = fields.filter(isConditionField);
  const when = settings.alertWhen;
  const whenField = when ? fields.find((f) => f.id === when.fieldId) : undefined;
  const delivery = settings.alertDelivery?.mode === 'daily' ? 'daily' : 'instant';
  const used = new Set(alerts.map((a) => a.channel));

  return (
    <Group icon={<Users className="h-4 w-4" />} title={t('Alerts for this form')} text={t('Send new responses to people who don’t have a FormCraft account.')}>
      {alerts.map((r, i) => {
        const bad = r.to.trim() !== '' && !recipientLooksValid(r.channel, r.to);
        return (
          <div key={i} className="min-w-0 space-y-1.5 rounded-lg bg-white p-2 ring-1 ring-inset ring-slate-200">
            <div className="flex min-w-0 items-center gap-1.5">
              <select
                className="input !h-8 min-w-0 flex-1 !py-0 text-xs"
                value={r.channel}
                aria-label={t('Channel')}
                onChange={(e) => patch(i, { channel: e.target.value as AlertChannel, attach: e.target.value === 'telegram' ? 'none' : r.attach })}
              >
                {(['email', 'whatsapp', 'telegram'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(CHANNEL_NAME[c])}
                  </option>
                ))}
              </select>
              {r.channel !== 'telegram' && (
                <select className="input !h-8 min-w-0 flex-1 !py-0 text-xs" value={r.attach} aria-label={t('Attachment')} onChange={(e) => patch(i, { attach: e.target.value as FormAlertRecipient['attach'] })}>
                  <option value="none">{t('No file')}</option>
                  <option value="pdf">{t('With PDF')}</option>
                  <option value="xlsx">{t('With Excel')}</option>
                </select>
              )}
              <button type="button" onClick={() => setAlerts(alerts.filter((_, j) => j !== i))} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Remove')}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              className={cn('input !h-8 text-sm', bad && '!border-red-300')}
              dir="ltr"
              value={r.to}
              maxLength={200}
              placeholder={TO_PLACEHOLDER[r.channel]}
              aria-label={t(CHANNEL_NAME[r.channel])}
              inputMode={r.channel === 'email' ? 'email' : r.channel === 'whatsapp' ? 'tel' : 'text'}
              onChange={(e) => patch(i, { to: e.target.value })}
            />
            {bad && (
              <p className="text-[11px] text-red-600">
                {r.channel === 'email'
                  ? t('Enter a valid email — it won’t be saved until it is.')
                  : r.channel === 'whatsapp'
                    ? t('Enter the number with its country code, e.g. +971 50 123 4567.')
                    : t('Use a chat ID (groups start with -) or @channelname.')}
              </p>
            )}
            {r.channel === 'telegram' && !bad && <p className="text-[11px] text-slate-500">{t('Add your bot to the group or channel first. Telegram gets the text and a link.')}</p>}
          </div>
        );
      })}
      {[...used].map((c) => (
        <Unavailable key={c} channel={c} status={status} />
      ))}
      <button
        type="button"
        disabled={alerts.length >= MAX_ALERT_RECIPIENTS}
        onClick={() => setAlerts([...alerts, { channel: 'email', to: '', attach: 'none' }])}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" /> {alerts.length ? t('Add another') : t('Add a recipient')}
      </button>

      <div className="h-px bg-slate-200/70" />

      <ToggleRow
        label={t('Only when…')}
        description={t('Alert only for some responses. Applies to team members’ alerts for this form too.')}
        checked={!!when}
        onChange={(on) => onSettings({ alertWhen: on ? { fieldId: condFields[0]?.id ?? '', op: 'is', value: '' } : undefined })}
      />
      {when && (
        <div className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-inset ring-slate-200">
          {condFields.length === 0 ? (
            <p className="text-xs text-slate-500">{t('Add a choice, text, email or phone question first.')}</p>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Filter className="h-3.5 w-3.5 shrink-0" />
                <select className="input !h-8 min-w-0 flex-1 !py-0 text-xs" value={when.fieldId} aria-label={t('Question')} onChange={(e) => onSettings({ alertWhen: { ...when, fieldId: e.target.value, value: '' } })}>
                  {!whenField && <option value="">{t('Pick a question')}</option>}
                  {condFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label || t('Untitled question')}
                    </option>
                  ))}
                </select>
              </div>
              <PillRow
                label={t('Answer')}
                value={when.op}
                onChange={(op) => onSettings({ alertWhen: { ...when, op } })}
                options={[
                  { value: 'is', label: t('is') },
                  { value: 'contains', label: t('contains') },
                ]}
              />
              {whenField?.options?.length && when.op === 'is' ? (
                <select className="input !h-8 !py-0 text-sm" value={when.value} aria-label={t('Value')} onChange={(e) => onSettings({ alertWhen: { ...when, value: e.target.value } })}>
                  <option value="">{t('Pick an answer')}</option>
                  {whenField.options.map((o) => (
                    <option key={o.id} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input !h-8 text-sm" value={when.value} maxLength={200} aria-label={t('Value')} placeholder={t('e.g. Urgent')} onChange={(e) => onSettings({ alertWhen: { ...when, value: e.target.value } })} />
              )}
              {!when.value.trim() && <p className="text-[11px] text-amber-700">{t('Pick or type an answer — until then every response alerts.')}</p>}
            </>
          )}
        </div>
      )}

      <div className="h-px bg-slate-200/70" />

      <PillRow
        label={t('Delivery for the people above')}
        value={delivery}
        onChange={(mode) => onSettings({ alertDelivery: mode === 'daily' ? { mode, time: settings.alertDelivery?.time || '18:00' } : undefined })}
        options={[
          { value: 'instant', label: t('Each response') },
          { value: 'daily', label: t('Daily summary') },
        ]}
      />
      {delivery === 'daily' && (
        <>
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t('Send at')}
            <input
              type="time"
              className="input !h-8 w-28 !py-0 text-sm"
              value={settings.alertDelivery?.time || '18:00'}
              onChange={(e) => e.target.value && onSettings({ alertDelivery: { mode: 'daily', time: e.target.value } })}
            />
            <span className="text-slate-400">{t('server time')}</span>
          </label>
          <p className="text-[11px] text-slate-500">
            {t('One message a day with the number of new responses and an Excel file of them (Telegram gets a link). Nothing is sent on days without responses. Team members still get their own alerts instantly.')}
          </p>
        </>
      )}
    </Group>
  );
}

/* ------------------------------ 2. respondent confirmation ------------------------------ */

function ConfirmGroup({ formId, fields, confirm, onConfirm, status }: { formId: string; fields: FormField[]; confirm: FormConfirm; onConfirm: (c: FormConfirm | undefined) => void; status: Status | null }) {
  const t = useT();
  const phoneFields = fields.filter((f) => f.type === 'phone');
  const emailFields = fields.filter((f) => f.type === 'email');
  const greet = greetingField(fields);
  const defaultMessage = greet
    ? t('Thank you {name}! We’ve received your response to {form}.', { name: `{${greet.label.trim()}}`, form: '{Form title}' })
    : t('Thank you! We’ve received your response to {form}.', { form: '{Form title}' });
  const wa = confirm.whatsapp;
  const em = confirm.email;
  const set = (p: Partial<FormConfirm>) => {
    const next = { ...confirm, ...p };
    onConfirm(next.whatsapp || next.email ? next : undefined);
  };

  return (
    <Group icon={<Send className="h-4 w-4 rtl:-scale-x-100" />} title={t('Message to the person who filled it')} text={t('A thank-you sent to the number or email they typed in the form.')}>
      {/* WhatsApp */}
      <ToggleRow
        label={t('WhatsApp message')}
        description={phoneFields.length ? t('Sent to the number in a Phone question.') : t('Add a Phone question to use this.')}
        checked={!!wa?.enabled}
        onChange={(on) => set({ whatsapp: { enabled: on, fieldId: wa?.fieldId || phoneFields[0]?.id || '', message: wa?.message || defaultMessage } })}
      />
      {wa?.enabled && (
        <div className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-inset ring-slate-200">
          <Unavailable channel="whatsapp" status={status} />
          <FieldPick label={t('Send to the number in')} fields={phoneFields} value={wa.fieldId} onChange={(fieldId) => set({ whatsapp: { ...wa, fieldId } })} empty={t('Add a Phone question first.')} />
          <MessageBox label={t('Message')} value={wa.message} onChange={(message) => set({ whatsapp: { ...wa, message } })} fields={fields} max={MAX_MESSAGE} rows={4} />
          <TestButton formId={formId} channel="whatsapp" confirm={confirm} status={status} />
        </div>
      )}

      {/* Email */}
      <ToggleRow
        label={t('Email')}
        description={emailFields.length ? t('Sent to the address in an Email question.') : t('Add an Email question to use this.')}
        checked={!!em?.enabled}
        onChange={(on) =>
          set({
            email: {
              enabled: on,
              fieldId: em?.fieldId || emailFields[0]?.id || '',
              subject: em?.subject || t('We received your response · {form}', { form: '{Form title}' }),
              message: em?.message || defaultMessage,
            },
          })
        }
      />
      {em?.enabled && (
        <div className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-inset ring-slate-200">
          <Unavailable channel="email" status={status} />
          <FieldPick label={t('Send to the address in')} fields={emailFields} value={em.fieldId} onChange={(fieldId) => set({ email: { ...em, fieldId } })} empty={t('Add an Email question first.')} />
          <MessageBox label={t('Subject')} value={em.subject} onChange={(subject) => set({ email: { ...em, subject } })} fields={fields} max={MAX_SUBJECT} rows={1} />
          <MessageBox label={t('Message')} value={em.message} onChange={(message) => set({ email: { ...em, message } })} fields={fields} max={MAX_MESSAGE} rows={4} />
          <TestButton formId={formId} channel="email" confirm={confirm} status={status} />
        </div>
      )}

      {(wa?.enabled || em?.enabled) && (
        <ToggleRow label={t('Attach their answers as a PDF')} description={t('A copy of their own response.')} checked={!!confirm.attachPdf} onChange={(attachPdf) => set({ attachPdf: attachPdf || undefined })} />
      )}
      {(wa?.enabled || em?.enabled) && <p className="text-[11px] text-slate-500">{t('Sent only to what the person typed, at most 60 messages per 10 minutes for this form.')}</p>}
    </Group>
  );
}

function FieldPick({ label, fields, value, onChange, empty }: { label: string; fields: FormField[]; value: string; onChange: (id: string) => void; empty: string }) {
  const t = useT();
  if (!fields.length) return <p className="text-xs text-amber-700">{empty}</p>;
  return (
    <Section label={label}>
      <select className="input !h-8 !py-0 text-sm" value={fields.some((f) => f.id === value) ? value : ''} onChange={(e) => onChange(e.target.value)}>
        {!fields.some((f) => f.id === value) && <option value="">{t('Pick a question')}</option>}
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label || t('Untitled question')}
          </option>
        ))}
      </select>
    </Section>
  );
}

/** A text box with clickable {placeholder} chips that insert at the cursor. */
function MessageBox({ label, value, onChange, fields, max, rows }: { label: string; value: string; onChange: (v: string) => void; fields: FormField[]; max: number; rows: number }) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const labels = [
    ...FIXED_PLACEHOLDERS,
    ...fields
      .filter((f) => f.type !== 'terms' && f.type !== 'file' && f.label.trim() && !/[{}]/.test(f.label))
      .map((f) => f.label.trim())
      .slice(0, 12),
  ];
  const insert = (name: string) => {
    const el = ref.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + token + value.slice(end)).slice(0, max);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <Section label={label}>
      {rows > 1 ? (
        <textarea ref={ref} className="input resize-y text-sm" rows={rows} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input ref={ref} className="input !h-8 text-sm" maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      <div className="mt-1.5 flex flex-wrap gap-1" aria-label={t('Insert an answer')}>
        {labels.map((l) => (
          <button
            key={l}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(l)}
            title={t('Insert an answer')}
            className="max-w-full truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
          >
            {`{${l}}`}
          </button>
        ))}
      </div>
    </Section>
  );
}

function TestButton({ formId, channel, confirm, status }: { formId: string; channel: 'whatsapp' | 'email'; confirm: FormConfirm; status: Status | null }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const to = channel === 'email' ? status?.me.email : status?.me.whatsapp;
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${formId}/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, confirm }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) toast(t('Test sent to {to}', { to: data?.to ?? to ?? '' }));
      else toast(typeof data?.error === 'string' ? t(data.error) : t('Couldn’t send the test message.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={send}
        disabled={busy || !status?.channels[channel] || !to}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
      >
        {channel === 'email' ? <Mail className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
        {busy ? t('Sending…') : t('Send me a test')}
      </button>
      {status && !to && (
        <span className="text-[11px] text-slate-500">
          {channel === 'email' ? t('Save your email in My profile first.') : t('Save your WhatsApp number in My profile first.')}
        </span>
      )}
      {to && <span className="min-w-0 truncate text-[11px] text-slate-400" dir="ltr">{to}</span>}
    </div>
  );
}
