import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getCurrentUser } from '../auth';
import { prisma } from '../db';
import { getSettings } from '../settings';
import { DEFAULT_LOCALE, isLocale, isThemePref, LANG_COOKIE, makeT, matchLocale, THEME_COOKIE, type Locale, type ThemePref } from '.';

/** Language for this request: user preference → cookie → browser → workspace default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser();
  if (user) {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { language: true } });
    if (isLocale(row?.language)) return row.language;
  }
  const c = cookies().get(LANG_COOKIE)?.value;
  if (isLocale(c)) return c;
  const fromBrowser = matchLocale(headers().get('accept-language'));
  if (isLocale(fromBrowser)) return fromBrowser;
  const { app } = await getSettings();
  return isLocale(app.defaultLanguage) ? app.defaultLanguage : DEFAULT_LOCALE;
});

/** Theme preference: user → cookie → follow the device. */
export const getThemePref = cache(async (): Promise<ThemePref> => {
  const user = await getCurrentUser();
  if (user) {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { theme: true } });
    if (isThemePref(row?.theme)) return row.theme;
  }
  const c = cookies().get(THEME_COOKIE)?.value;
  return isThemePref(c) ? c : 'system';
});

export async function getServerT() {
  return makeT(await getLocale());
}
