'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useT } from './i18n';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tr = useT();
  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex animate-pop-in items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lift"
          >
            {t.tone === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
            {t.tone === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />}
            {t.tone === 'info' && <Info className={cn('h-4 w-4 shrink-0 text-sky-400')} />}
            {tr(t.message)}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
