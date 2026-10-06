'use client';

import { useEffect, useState } from 'react';
import { dirOf, makeT } from '@/lib/i18n';
import { PoweredByCredit } from '@/components/powered-by-credit';

export const FORM_LANG_EVENT = 'fc:form-lang';

/** "Powered by" footer under public forms; follows the language the respondent switches to. */
export function PoweredBy({ initialLang, footerText, footerUrl, logoUrl }: { initialLang: string; footerText?: string; footerUrl?: string; logoUrl?: string }) {
  const [lang, setLang] = useState(initialLang);
  useEffect(() => {
    const on = (e: Event) => setLang((e as CustomEvent<string>).detail);
    window.addEventListener(FORM_LANG_EVENT, on);
    return () => window.removeEventListener(FORM_LANG_EVENT, on);
  }, []);
  return (
    <div className="mt-6">
      <PoweredByCredit label={makeT(lang)('Powered by')} footerText={footerText} footerUrl={footerUrl} logoUrl={logoUrl} dir={dirOf(lang)} />
    </div>
  );
}
