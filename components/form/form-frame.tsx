import type { ReactNode } from 'react';
import { useT } from '@/components/i18n';
import { categoryStyle } from '@/lib/categories';
import { accentVars } from '@/lib/theme';
import type { FormBranding } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Card chrome around a rendered form: applies the form's own accent palette and the
 * cover banner (or colour bar). Shared by the public page, builder canvas and preview.
 */
export function FormFrame({
  branding,
  category,
  children,
  className,
}: {
  branding?: FormBranding;
  category: string;
  children: ReactNode;
  className?: string;
}) {
  const vars = accentVars(branding?.accent);
  // Without a custom accent, keep the category colour bar from the dashboard.
  const bar = vars ? 'from-brand-500 via-brand-500 to-brand-700' : categoryStyle(category).gradient;
  return (
    <div style={vars} className={cn('card overflow-hidden', className)}>
      {branding?.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.coverUrl} alt="" className="h-36 w-full object-cover sm:h-44" />
      ) : (
        <div className={cn('h-2 bg-gradient-to-r', bar)} />
      )}
      {children}
    </div>
  );
}

const LOGO_SIZE = {
  above: { sm: 'max-h-10 max-w-[140px]', md: 'max-h-16 max-w-[200px]', lg: 'max-h-24 max-w-[300px]' },
  inline: { sm: 'max-h-10 max-w-[80px]', md: 'max-h-14 max-w-[120px]', lg: 'max-h-20 max-w-[160px]' },
};

/**
 * Logo + title + description, laid out from the form's branding:
 * logo above or beside the title, three logo sizes, left/center alignment, optional hidden title.
 * `title` / `description` are nodes so the builder can pass editable inputs.
 */
export function FormHeader({
  branding,
  title,
  description,
  footer,
  editing,
}: {
  branding?: FormBranding;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  /** Builder canvas: keep the (dimmed) title input visible even when the title is hidden. */
  editing?: boolean;
}) {
  const t = useT();
  const b = branding ?? {};
  const center = b.logoAlign === 'center';
  const inline = b.logoPlacement === 'inline';
  const size = b.logoSize ?? 'md';
  const showTitle = !b.hideTitle;

  const logo = b.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={b.logoUrl}
      alt=""
      className={cn(
        'shrink-0 object-contain',
        LOGO_SIZE[inline ? 'inline' : 'above'][size],
        // Above a cover image the logo overlaps the banner on a white tile.
        b.coverUrl && !inline && '-mt-16 rounded-xl bg-white p-2 shadow-lift ring-1 ring-slate-200',
      )}
    />
  ) : null;

  const text = (
    <div className={cn('min-w-0', center && !inline && 'w-full')}>
      {showTitle ? title : editing ? <div className="opacity-40">{title}</div> : null}
      {editing && !showTitle && <p className="text-[11px] font-medium text-amber-600">{t('Title hidden on the published form')}</p>}
      {description}
    </div>
  );

  return (
    <header className={cn('mb-8', center && 'text-center')}>
      {inline && logo ? (
        <div className={cn('flex items-center gap-4', center && 'justify-center text-start')}>
          {logo}
          {text}
        </div>
      ) : (
        <>
          {logo && <div className={cn('mb-5 flex', center && 'justify-center')}>{logo}</div>}
          {text}
        </>
      )}
      {footer}
    </header>
  );
}
