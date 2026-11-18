import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FormFrame } from '@/components/form/form-frame';
import { FormRenderer } from '@/components/form/form-renderer';
import { PoweredBy } from '@/components/form/powered-by';
import { Logo } from '@/components/icons';
import { canViewForm, getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { publicSchema, toFormDTO } from '@/lib/forms';
import { formLanguages } from '@/lib/form-i18n';
import { dirOf, makeT } from '@/lib/i18n';
import { formLayout, LAYOUT_PAGE } from '@/lib/form-layout';
import { getSettings } from '@/lib/settings';
import { accentVars } from '@/lib/theme';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

async function load(id: string) {
  // Accepts either the form id or its custom link name.
  const row = await prisma.form.findFirst({ where: { OR: [{ id }, { slug: id.toLowerCase() }] } });
  return row ? toFormDTO(row) : null;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const form = await load(params.id);
  return { title: form?.title ?? 'Form not found', description: form?.description };
}

export default async function PublicFormPage({ params, searchParams }: { params: { id: string }; searchParams: { preview?: string; lang?: string } }) {
  const form = await load(params.id);
  if (!form) notFound();
  // Draft previews are only shown to signed-in users who can see the form.
  const viewer = searchParams.preview === '1' ? await getCurrentUser() : null;
  const preview = !!viewer && canViewForm(viewer, form.id);
  const { app } = await getSettings();
  const closed = form.status !== 'ACTIVE' && !preview;
  // Page chrome follows the requested form language (?lang=) or the form's primary language.
  const langs = formLanguages(form.schema);
  const open = form.schema.settings.openLanguage;
  const lang = searchParams.lang && langs.includes(searchParams.lang) ? searchParams.lang : open && langs.includes(open) ? open : langs[0];
  const t = makeT(lang);
  // Forms can force a theme; "auto" follows the respondent's device.
  const theme = form.schema.settings.theme === 'light' || form.schema.settings.theme === 'dark' ? form.schema.settings.theme : '';
  // Form look: page background and width (minimal runs edge to edge, split is wider).
  const layout = formLayout(form.schema.settings);
  const page = LAYOUT_PAGE[layout];

  return (
    <main
      className={cn('flex min-h-screen flex-col text-slate-900', page.bg, page.flush ? 'pb-6' : 'px-3 py-4 sm:px-4 sm:pt-14 sm:pb-6', theme)}
      style={accentVars(form.schema.settings.branding?.accent)}
    >
      <div className={cn('mx-auto flex w-full flex-1 flex-col', page.width)}>
        {preview && form.status !== 'ACTIVE' && (
          <div className={cn('mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800 ring-1 ring-amber-200', page.flush && 'mx-3 mt-3')} dir={dirOf(lang)}>
            {t('Previewing a draft. Publish the form to start accepting responses.')}
          </div>
        )}
        <FormFrame branding={form.schema.settings.branding} category={form.category} layout={layout}>
          {closed ? (
            <div className="px-8 py-16 text-center" dir={dirOf(lang)}>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Lock className="h-5 w-5" />
              </div>
              <h1 className="text-lg font-semibold text-slate-900">{form.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('This form is not accepting responses right now.')}</p>
            </div>
          ) : (
            <FormRenderer formId={form.id} title={form.title} description={form.description} schema={publicSchema(form.schema)} mode={preview ? 'preview' : 'live'} initialLanguage={searchParams.lang} />
          )}
        </FormFrame>
        <div className="flex-1" />
        <PoweredBy initialLang={lang} footerText={app.footerText} footerUrl={app.footerUrl || undefined} logoUrl={app.logoUrl || undefined} />
      </div>
    </main>
  );
}
