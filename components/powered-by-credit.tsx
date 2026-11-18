import { POWERED_BY_NAME, POWERED_BY_URL } from '@/lib/brand';
import { Logo } from './icons';

const linkCls = 'font-semibold text-slate-700 underline-offset-2 transition hover:text-brand-600 hover:underline';

/**
 * Footer credit used on app pages and public forms: the workspace's own optional branding,
 * followed by the fixed "Powered by Sha The IT Guy" credit (not configurable).
 */
export function PoweredByCredit({
  label,
  footerText,
  footerUrl,
  logoUrl,
  dir,
}: {
  label: string;
  footerText?: string;
  footerUrl?: string;
  logoUrl?: string;
  dir?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-600" dir={dir}>
      {footerText && (
        <>
          {/* The workspace's own branding: its logo sits with its name, never with the credit. */}
          <span className="inline-flex items-center gap-1.5">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-4 w-4 shrink-0 object-contain" />
            )}
            {footerUrl ? (
              <a href={footerUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {footerText}
              </a>
            ) : (
              <span className="font-semibold text-slate-700">{footerText}</span>
            )}
          </span>
          <span aria-hidden className="text-slate-400">
            ·
          </span>
        </>
      )}
      <span className="inline-flex items-center gap-1.5 text-slate-400">
        {/* Always the FormCraft mark: the credit is fixed and never shows the workspace logo. Kept quieter than the workspace's own name. */}
        <Logo className="h-4 w-4 opacity-80" />
        <span>{label}</span>
        <a href={POWERED_BY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-500 underline-offset-2 transition hover:text-brand-600 hover:underline">
          {POWERED_BY_NAME}
        </a>
      </span>
    </div>
  );
}
