'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const START_EVENT = 'fc:navstart';

/** Call before router.push() so the top bar starts at once (links are picked up automatically). */
export function navStart() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(START_EVENT));
}

/** Page data requests (not prefetches) Next.js made: which page and when, for NavProgress's freshness check. */
let pageFetches: { path: string; at: number }[] = [];

/** Notes each page data request (`RSC: 1` header, not a prefetch) as it starts. Installed once per tab. */
function watchPageFetches() {
  const w = window as unknown as { __fcPageFetchWatch?: boolean };
  if (w.__fcPageFetchWatch) return;
  w.__fcPageFetchWatch = true;
  const original = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (headers.get('RSC') === '1' && headers.get('Next-Router-Prefetch') !== '1') {
        const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
        pageFetches.push({ path: url.pathname, at: performance.now() });
      }
    } catch {
      /* never get in the way of the request itself */
    }
    return original.apply(this, [input, init] as Parameters<typeof fetch>);
  };
}

/**
 * A thin accent-coloured bar at the top of the window while the next page loads. It starts the moment a link
 * is tapped (before the server answers), creeps forward, and completes when the new page is shown.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();
  const router = useRouter();

  // Always fresh pages. Next.js sometimes shows a page from its in-memory copy without asking the server: on
  // Back / Forward, and (despite staleTimes.dynamic = 0) for pages first opened inside the app, e.g. the dashboard
  // after signing in. That copy predates any change, so a form created since was missing until a reload.
  // After each in-app page change: if the server wasn't asked for that page, show the copy and fetch it fresh now.
  useEffect(() => watchPageFetches(), []);
  const shownAt = useRef(0);
  useEffect(() => {
    const previous = shownAt.current;
    shownAt.current = performance.now();
    if (!previous) return; // the first page of this visit came straight from the server
    const path = window.location.pathname;
    const fetched = pageFetches.some((f) => f.at >= previous && f.path === path);
    pageFetches = pageFetches.filter((f) => f.at >= previous);
    if (!fetched) router.refresh();
  }, [pathname, search, router]);

  useEffect(() => {
    const start = () => {
      clearInterval(timer.current);
      clearTimeout(doneTimer.current);
      setState('loading');
      setWidth(12);
      // Creep towards 90 %: fast at first, slower the longer it takes.
      timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 180);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
      // Same page (or only a #hash change): nothing will load.
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(START_EVENT, start);
      clearInterval(timer.current);
      clearTimeout(doneTimer.current);
    };
  }, []);

  // The URL changed: the new page is on screen.
  const loading = useRef(false);
  loading.current = state === 'loading';
  useEffect(() => {
    if (!loading.current) return;
    const finish = () => {
      clearInterval(timer.current);
      setState('done');
      setWidth(100);
      doneTimer.current = setTimeout(() => {
        setState('idle');
        setWidth(0);
      }, 350);
    };
    // The URL changes as soon as the loading screen (app/loading.tsx) shows; keep going until the page replaces it.
    if (!document.querySelector('.fc-loader')) return finish();
    const watch = new MutationObserver(() => {
      if (document.querySelector('.fc-loader')) return;
      watch.disconnect();
      finish();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div
        className="h-full bg-brand-500 shadow-[0_0_10px_rgb(var(--brand-500)/0.7)]"
        style={{
          width: `${width}%`,
          opacity: state === 'idle' ? 0 : state === 'done' ? 0 : 1,
          transition: state === 'done' ? 'width .2s ease-out, opacity .3s ease .15s' : state === 'loading' ? 'width .2s ease-out' : 'none',
        }}
      />
    </div>
  );
}
