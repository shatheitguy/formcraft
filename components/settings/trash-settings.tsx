'use client';

import { FileText, Inbox, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Button, ConfirmDialog, EmptyState } from '@/components/ui';
import type { TrashEntry } from '@/lib/trash';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import { SettingsCard } from './settings-ui';

const DAY_MS = 86_400_000;

/** Settings → Trash: deleted forms and responses, kept for `days` days, with Restore and Delete forever. */
export function TrashSettings({ initial, days }: { initial: TrashEntry[]; days: number }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'one'; item: TrashEntry } | { kind: 'all' } | null>(null);

  const restore = async (item: TrashEntry) => {
    setBusy(item.id);
    const res = await fetch(`/api/admin/trash/${item.id}`, { method: 'POST' });
    const j = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) return toast(t(typeof j?.error === 'string' ? j.error : 'Could not restore it.'), 'error');
    setItems((list) => list.filter((i) => i.id !== item.id));
    toast(
      item.kind === 'form'
        ? j?.changedLink
          ? t('Form restored. Its old link was taken, so it got a new one.')
          : t('Form restored with its responses.')
        : t('Response restored.'),
    );
    router.refresh();
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(confirm.kind === 'all' ? 'all' : confirm.item.id);
    const res = await fetch(confirm.kind === 'all' ? '/api/admin/trash' : `/api/admin/trash/${confirm.item.id}`, { method: 'DELETE' });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return toast(t(typeof j?.error === 'string' ? j.error : 'Could not delete it.'), 'error');
    }
    if (confirm.kind === 'all') setItems([]);
    // Deleting a form for good also removes its responses that were in the Trash.
    else setItems((list) => list.filter((i) => i.id !== confirm.item.id && !(confirm.item.kind === 'form' && i.kind === 'submission' && i.formId === confirm.item.formId)));
    setConfirm(null);
    toast(confirm.kind === 'all' ? t('Trash emptied.') : t('Deleted for good.'));
  };

  const daysLeft = (i: TrashEntry) => Math.max(0, Math.ceil((new Date(i.expiresAt).getTime() - Date.now()) / DAY_MS));

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t('Trash')}
        icon={<Trash2 />}
        description={t('Deleted forms and responses stay here for {n} days, then they are removed for good together with their uploaded files.', { n: days })}
        aside={
          items.length > 0 && (
            <Button variant="danger" size="sm" onClick={() => setConfirm({ kind: 'all' })} loading={busy === 'all'}>
              {t('Empty Trash')}
            </Button>
          )
        }
      >
        {items.length === 0 ? (
          <EmptyState icon={<Trash2 />} title={t('The Trash is empty')} description={t('Forms and responses you delete appear here.')} />
        ) : (
          <ul className="-my-2 divide-y divide-slate-100">
            {items.map((i) => {
              const left = daysLeft(i);
              return (
                <li key={i.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', i.kind === 'form' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500')}>
                    {i.kind === 'form' ? <FileText className="h-4 w-4" /> : <Inbox className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-slate-900">{i.title || t('Untitled form')}</span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {i.kind === 'form' ? (i.count === 1 ? t('Form · 1 response') : t('Form · {n} responses', { n: i.count })) : t('Response')}
                      </span>
                    </div>
                    {i.preview && <p className="mt-0.5 truncate text-sm text-slate-600">{i.preview}</p>}
                    <p className="mt-0.5 text-xs text-slate-500" title={formatDateTime(i.deletedAt, locale)}>
                      {t('Deleted {when} by {name}', { when: timeAgo(i.deletedAt, t), name: i.deletedByName || t('someone') })}
                      {' · '}
                      <span className={cn(left <= 3 && 'font-medium text-rose-600')}>{left === 1 ? t('removed for good in 1 day') : t('removed for good in {n} days', { n: left })}</span>
                    </p>
                    {i.formMissing && <p className="mt-0.5 text-xs text-amber-600">{t('Its form is deleted. Restore the form first, then this response.')}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => restore(i)} loading={busy === i.id} disabled={!!busy || i.formMissing}>
                      <RotateCcw className="h-3.5 w-3.5" /> {t('Restore')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'one', item: i })} disabled={!!busy} aria-label={t('Delete forever')} title={t('Delete forever')}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        loading={!!busy}
        title={confirm?.kind === 'all' ? t('Empty the Trash?') : t('Delete forever?')}
        description={
          confirm?.kind === 'all'
            ? t('Everything in the Trash and its uploaded files will be removed for good. This can’t be undone.')
            : confirm?.item.kind === 'form'
              ? t('This form, its responses and its uploaded files will be removed for good. This can’t be undone.')
              : t('This response and its uploaded files will be removed for good. This can’t be undone.')
        }
        confirmLabel={t('Delete forever')}
      />
    </div>
  );
}
