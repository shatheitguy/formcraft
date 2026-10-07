'use client';

import { ArrowUpCircle, Bell, CheckCheck, FilePlus2, FileX2, Inbox, PencilLine, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './app-context';
import { useT } from './i18n';
import { buttonClass } from './ui';
import { cn, timeAgo } from '@/lib/utils';

interface Item {
  id: string;
  type: 'form.published' | 'form.drafted' | 'form.created' | 'form.deleted' | 'submission' | 'update.available';
  data: { form?: string; actor?: string; actorId?: string; count?: number; version?: string; current?: string };
  link: string | null;
  read: boolean;
  createdAt: string;
}
interface Feed {
  items: Item[];
  unread: number;
  update: { current: string; latest: string } | null;
}

const POLL_MS = 60_000;
const ICONS = {
  'form.published': { icon: Rocket, tone: 'bg-emerald-50 text-emerald-600' },
  'form.drafted': { icon: PencilLine, tone: 'bg-amber-50 text-amber-600' },
  'form.created': { icon: FilePlus2, tone: 'bg-brand-50 text-brand-600' },
  'form.deleted': { icon: FileX2, tone: 'bg-rose-50 text-rose-600' },
  submission: { icon: Inbox, tone: 'bg-sky-50 text-sky-600' },
  'update.available': { icon: ArrowUpCircle, tone: 'bg-violet-50 text-violet-600' },
} as const;

/** Bell in the top bar: form activity, new responses and software updates. Polls once a minute. */
export function NotificationBell() {
  const { user } = useApp();
  const t = useT();
  const router = useRouter();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/notifications', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setFeed(await res.json());
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function act(body: object) {
    await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    void load();
  }

  function openItem(n: Item) {
    if (!n.read) void act({ action: 'read', ids: [n.id] });
    setOpen(false);
    if (!n.link) return;
    if (/^https?:/.test(n.link)) window.open(n.link, '_blank', 'noopener');
    else router.push(n.link);
  }

  function message(n: Item) {
    const you = n.data.actorId === user?.id;
    const v = { actor: n.data.actor ?? '', form: n.data.form ?? '', n: n.data.count ?? 1, version: n.data.version ?? '', current: n.data.current ?? '' };
    switch (n.type) {
      case 'form.published':
        return you ? t('You published “{form}”', v) : t('{actor} published “{form}”', v);
      case 'form.drafted':
        return you ? t('You moved “{form}” back to draft', v) : t('{actor} moved “{form}” back to draft', v);
      case 'form.created':
        return you ? t('You created “{form}”', v) : t('{actor} created “{form}”', v);
      case 'form.deleted':
        return you ? t('You deleted “{form}”', v) : t('{actor} deleted “{form}”', v);
      case 'submission':
        return v.n === 1 ? t('New response on “{form}”', v) : t('{n} new responses on “{form}”', v);
      case 'update.available':
        return t('FormCraft {version} is available — you’re on {current}', v);
    }
  }

  const unread = feed?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className={buttonClass('ghost', 'sm', 'relative px-2')}
        title={t('Notifications')}
        aria-label={unread ? t('Notifications ({n} unread)', { n: unread }) : t('Notifications')}
        aria-expanded={open}
      >
        <Bell className={cn('h-4 w-4', unread > 0 && 'origin-top animate-[bell_1.2s_ease-in-out_1]')} />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-onaccent ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">{t('Notifications')}</span>
            {unread > 0 && (
              <button type="button" onClick={() => act({ action: 'read-all' })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <CheckCheck className="h-3.5 w-3.5" /> {t('Mark all as read')}
              </button>
            )}
          </div>

          {feed?.update && (
            <a
              href="https://github.com/shatheitguy/formcraft/commits/main"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 border-b border-slate-100 bg-violet-50/60 px-4 py-3 hover:bg-violet-50"
            >
              <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
              <span className="min-w-0 text-xs text-slate-700">
                <b className="block text-sm text-slate-900">{t('Update available: {version}', { version: feed.update.latest })}</b>
                {t('On the server run:')} <code className="rounded bg-white px-1 font-mono text-[11px] ring-1 ring-slate-200" dir="ltr">docker compose pull && docker compose up -d</code>
              </span>
            </a>
          )}

          <div className="scrollbar-thin max-h-[min(26rem,70vh)] overflow-y-auto">
            {!feed && <p className="px-4 py-8 text-center text-xs text-slate-400">{t('Loading…')}</p>}
            {feed && feed.items.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">{t('You’re all caught up')}</p>
                <p className="mt-0.5 text-xs text-slate-400">{t('Form changes, new responses and updates show up here.')}</p>
              </div>
            )}
            {feed?.items.map((n) => {
              const { icon: Icon, tone } = ICONS[n.type] ?? ICONS['form.created'];
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-slate-50', !n.read && 'bg-brand-50/40')}
                >
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm leading-snug', n.read ? 'text-slate-600' : 'font-medium text-slate-900')}>{message(n)}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">{timeAgo(n.createdAt, t)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label={t('Unread')} />}
                </button>
              );
            })}
          </div>

          {feed && feed.items.some((n) => n.read) && (
            <div className="border-t border-slate-100 px-4 py-2 text-end">
              <button type="button" onClick={() => act({ action: 'clear' })} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                {t('Clear read')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
