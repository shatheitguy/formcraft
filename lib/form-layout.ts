import type { FormLayout } from './types';

/** Every form look, in the order the pickers show them. 'classic' is the default. */
export const FORM_LAYOUTS: FormLayout[] = ['classic', 'minimal', 'steps', 'split'];

export const isFormLayout = (v: unknown): v is FormLayout => typeof v === 'string' && (FORM_LAYOUTS as string[]).includes(v);

/** The look a form uses; unknown or missing values fall back to classic. */
export const formLayout = (settings: { layout?: unknown } | undefined): FormLayout => (isFormLayout(settings?.layout) ? settings.layout : 'classic');

/** Page background and content width around the form, per look (public page and builder preview). */
export const LAYOUT_PAGE: Record<FormLayout, { bg: string; width: string; flush: boolean }> = {
  classic: { bg: 'bg-grid bg-slate-50', width: 'max-w-2xl', flush: false },
  steps: { bg: 'bg-grid bg-slate-50', width: 'max-w-2xl', flush: false },
  split: { bg: 'bg-grid bg-slate-50', width: 'max-w-5xl', flush: false },
  // Minimal: plain page, the cover runs edge to edge and the form sits in its own column.
  minimal: { bg: 'bg-white', width: 'max-w-none', flush: true },
};
