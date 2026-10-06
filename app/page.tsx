import { HubClient } from '@/components/hub/hub-client';
import { canCreateForms, canEditForm, formWhere, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { portRange } from '@/lib/form-links';
import { parseSchema } from '@/lib/forms';
import { ensureSeeded } from '@/lib/seed';
import type { HubForm } from '@/lib/types';
import { safeJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DAYS = 14;
const DAY_MS = 86_400_000;

export default async function HubPage() {
  const user = await requireUser();
  await ensureSeeded();
  const scope = formWhere(user);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const since = new Date(startOfToday.getTime() - (DAYS - 1) * DAY_MS);

  const [forms, recent, latest] = await Promise.all([
    prisma.form.findMany({
      where: scope,
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { submissions: true } } },
    }),
    prisma.submission.findMany({ where: { createdAt: { gte: since }, form: scope }, select: { formId: true, createdAt: true } }),
    prisma.submission.groupBy({ by: ['formId'], where: { form: scope }, _max: { createdAt: true } }),
  ]);

  const spark = new Map<string, number[]>();
  for (const s of recent) {
    const idx = Math.floor((s.createdAt.getTime() - since.getTime()) / DAY_MS);
    if (idx < 0 || idx >= DAYS) continue;
    const arr = spark.get(s.formId) ?? Array(DAYS).fill(0);
    arr[idx]++;
    spark.set(s.formId, arr);
  }
  const lastAt = new Map(latest.map((l) => [l.formId, l._max.createdAt]));

  const data: HubForm[] = forms.map((f) => {
    const schema = parseSchema(f.schema);
    return {
      id: f.id,
      title: f.title,
      description: f.description,
      category: f.category,
      tags: safeJson<string[]>(f.tags, []),
      status: f.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
      fieldCount: schema.fields.length,
      quiz: schema.settings.quiz,
      responses: f._count.submissions,
      lastResponseAt: lastAt.get(f.id)?.toISOString() ?? null,
      updatedAt: f.updatedAt.toISOString(),
      spark: spark.get(f.id) ?? Array(DAYS).fill(0),
      canEdit: canEditForm(user, f.id),
      logoUrl: schema.settings.branding?.logoUrl ?? null,
      slug: f.slug,
      port: f.port,
      customDomain: f.customDomain,
    };
  });

  return <HubClient forms={data} canCreate={canCreateForms(user)} portRange={portRange()} />;
}
