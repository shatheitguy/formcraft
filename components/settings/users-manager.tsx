'use client';

import { Check, Eye, KeyRound, Pencil, Plus, Search, Shield, ShieldCheck, Trash2, UserPlus, Users, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PasswordInput } from '@/components/auth/password-input';
import { useT } from '@/components/i18n';
import { useToast } from '@/components/toast';
import { Avatar } from '@/components/user-menu';
import { Button, ConfirmDialog, Dropdown, Modal, Segmented, Switch } from '@/components/ui';
import { categoryStyle } from '@/lib/categories';
import { ROLE_INFO, ROLES, type FormScope, type Role } from '@/lib/roles';
import { cn, timeAgo } from '@/lib/utils';
import { Field, SettingsCard, rich, sendJson } from './settings-ui';

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  formScope: FormScope;
  formIds: string[];
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface FormOption {
  id: string;
  title: string;
  category: string;
  status: string;
}

const ROLE_ICONS = { ADMIN: ShieldCheck, EDITOR: Pencil, VIEWER: Eye };

export function UsersManager({ users, forms, meId }: { users: ManagedUser[]; forms: FormOption[]; meId: string }) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [editing, setEditing] = useState<ManagedUser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const formTitle = useMemo(() => new Map(forms.map((f) => [f.id, f.title])), [forms]);

  const shown = users.filter((u) => !q || `${u.name} ${u.username} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const counts = ROLES.map((r) => users.filter((u) => u.role === r).length);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    const r = await sendJson(`/api/admin/users/${deleting.id}`, 'DELETE');
    setBusy(false);
    setDeleting(null);
    if (!r.ok) return toast(t(r.error!), 'error');
    toast(t('User deleted'));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Role overview */}
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((r, i) => {
          const Icon = ROLE_ICONS[r];
          return (
            <div key={r} className="card p-4">
              <div className="flex items-center gap-2">
                <span className={cn('chip', ROLE_INFO[r].tone)}>
                  <Icon className="h-3 w-3" /> {t(ROLE_INFO[r].label)}
                </span>
                <span className="ms-auto text-lg font-bold tabular-nums text-slate-900">{counts[i]}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">{t(ROLE_INFO[r].description)}</p>
            </div>
          );
        })}
      </div>

      <SettingsCard
        title={t('Users')}
        description={t('Invite teammates and decide what each person can see and do.')}
        icon={<Users />}
        aside={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <UserPlus className="h-4 w-4" /> {t('Add user')}
          </Button>
        }
      >
        <div className="relative -mt-1 mb-4">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input h-9 ps-9" placeholder={t('Search users…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-6 divide-y divide-slate-100 border-t border-slate-100">
          {shown.map((u) => {
            const Icon = ROLE_ICONS[u.role];
            const access =
              u.role === 'ADMIN' || u.formScope === 'ALL'
                ? t('All forms')
                : u.formIds.length === 0
                  ? t('No forms')
                  : u.formIds.length <= 2
                    ? u.formIds.map((id) => formTitle.get(id) ?? '—').join(t(', '))
                    : t('{n} forms', { n: u.formIds.length });
            return (
              <div key={u.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3', !u.active && 'opacity-60')}>
                <Avatar name={u.name} fallback={u.username} src={u.avatarUrl} className="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{u.name || u.username}</span>
                    {u.id === meId && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-semibold uppercase text-slate-500">{t('You')}</span>}
                    {!u.active && <span className="rounded bg-rose-50 px-1.5 text-[10px] font-semibold uppercase text-rose-600">{t('Disabled')}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    @{u.username} · {u.email}
                  </div>
                </div>
                <span className={cn('chip', ROLE_INFO[u.role].tone)}>
                  <Icon className="h-3 w-3" /> {t(ROLE_INFO[u.role].label)}
                </span>
                <span className="hidden w-40 truncate text-xs text-slate-500 md:block" title={access}>
                  <Shield className="me-1 inline h-3 w-3" />
                  {access}
                </span>
                <span className="hidden w-24 text-end text-xs text-slate-400 lg:block">{u.lastLoginAt ? timeAgo(u.lastLoginAt, t) : t('Never signed in')}</span>
                <Dropdown
                  trigger={
                    <Button variant="ghost" size="xs">
                      {t('Manage')}
                    </Button>
                  }
                  items={[
                    { label: t('Edit user & access'), icon: <Pencil />, onClick: () => setEditing(u) },
                    ...(u.id !== meId ? [{ label: t('Delete user'), icon: <Trash2 />, onClick: () => setDeleting(u), danger: true, divider: true }] : []),
                  ]}
                />
              </div>
            );
          })}
          {shown.length === 0 && <p className="px-6 py-10 text-center text-sm text-slate-500">{t('No users match “{q}”.', { q })}</p>}
        </div>
      </SettingsCard>

      {editing && (
        <UserDialog
          user={editing === 'new' ? null : editing}
          forms={forms}
          isSelf={editing !== 'new' && editing.id === meId}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            toast(msg);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busy}
        title={t('Delete user?')}
        description={rich(t('{name} will lose access immediately. Their forms and responses are kept.'), {
          name: <strong className="text-slate-900">{deleting?.name || deleting?.username}</strong>,
        })}
      />
    </div>
  );
}

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

function UserDialog({
  user,
  forms,
  isSelf,
  onClose,
  onSaved,
}: {
  user: ManagedUser | null;
  forms: FormOption[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const toast = useToast();
  const t = useT();
  const [v, setV] = useState({
    name: user?.name ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? ('VIEWER' as Role),
    formScope: user?.formScope ?? ('SELECTED' as FormScope),
    formIds: user?.formIds ?? [],
    active: user?.active ?? true,
  });
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  const toggleForm = (id: string) => set('formIds', v.formIds.includes(id) ? v.formIds.filter((x) => x !== id) : [...v.formIds, id]);
  const shownForms = forms.filter((f) => !q || f.title.toLowerCase().includes(q.toLowerCase()));

  async function save() {
    setSaving(true);
    const payload = { ...v, password: v.password || undefined };
    const r = user ? await sendJson(`/api/admin/users/${user.id}`, 'PATCH', payload) : await sendJson('/api/admin/users', 'POST', payload);
    setSaving(false);
    if (!r.ok) return toast(t(r.error!), 'error');
    onSaved(user ? t('User updated') : t('User @{username} created', { username: v.username }));
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? t('Edit {name}', { name: user.name || '@' + user.username }) : t('Add a user')}
      description={user ? t('Update details, role and form access.') : t('They can sign in right away with the username and password you set.')}
      footer={
        <>
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {user ? t('Save changes') : (
              <>
                <Plus className="h-4 w-4" /> {t('Create user')}
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div className="space-y-4">
          <Field label={t('Full name')}>
            <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder={t('Jane Doe')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Username')}>
              <input className="input" value={v.username} onChange={(e) => set('username', e.target.value.toLowerCase())} placeholder="jane" />
            </Field>
            <Field label={t('Email')}>
              <input className="input" type="email" value={v.email} onChange={(e) => set('email', e.target.value)} placeholder="jane@company.com" dir="ltr" />
            </Field>
          </div>
          <Field label={user ? t('Reset password') : t('Password')} hint={user ? t('Leave empty to keep the current password. Resetting signs the user out everywhere.') : t('At least 8 characters. Share it with the user securely.')}>
            <div className="flex gap-2">
              <div className="flex-1">
                <PasswordInput value={v.password} onChange={(e) => set('password', e.target.value)} placeholder={user ? t('New password') : t('Password')} autoComplete="new-password" />
              </div>
              <Button type="button" onClick={() => set('password', randomPassword())} title={t('Generate a strong password')}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          {user && !isSelf && (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-100">
              <div>
                <div className="text-sm font-medium text-slate-800">{t('Account active')}</div>
                <div className="text-xs text-slate-500">{t('Disabled users can’t sign in.')}</div>
              </div>
              <Switch checked={v.active} onChange={(x) => set('active', x)} label={t('Active')} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="label">{t('Role')}</div>
            <div className="space-y-2">
              {ROLES.map((r) => {
                const Icon = ROLE_ICONS[r];
                const on = v.role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={isSelf}
                    onClick={() => set('role', r)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-start transition disabled:cursor-not-allowed disabled:opacity-60',
                      on ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-brand-600 text-onaccent' : 'bg-slate-100 text-slate-500')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{t(ROLE_INFO[r].label)}</span>
                      <span className="block text-xs text-slate-500">{t(ROLE_INFO[r].description)}</span>
                    </span>
                    {on && <Check className="mt-1 h-4 w-4 text-brand-600" />}
                  </button>
                );
              })}
            </div>
            {isSelf && <p className="mt-2 text-xs text-slate-500">{t('You can’t change your own role.')}</p>}
          </div>

          {v.role !== 'ADMIN' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="label !mb-0">{t('Form access')}</span>
                <Segmented
                  value={v.formScope}
                  onChange={(x) => set('formScope', x)}
                  options={[
                    { value: 'ALL', label: t('All forms') },
                    { value: 'SELECTED', label: t('Selected') },
                  ]}
                />
              </div>
              {v.formScope === 'ALL' ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-inset ring-slate-100">
                  {v.role === 'VIEWER' ? t('Can view reports for every form, including new ones.') : t('Can manage every form, including new ones.')}
                </p>
              ) : (
                <div className="rounded-lg ring-1 ring-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder={t('Filter forms…')} value={q} onChange={(e) => setQ(e.target.value)} />
                    <span className="text-[11px] tabular-nums text-slate-400">{t('{n} selected', { n: v.formIds.length })}</span>
                  </div>
                  <div className="scrollbar-thin max-h-56 overflow-y-auto p-1">
                    {shownForms.map((f) => {
                      const on = v.formIds.includes(f.id);
                      return (
                        <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                          <input type="checkbox" checked={on} onChange={() => toggleForm(f.id)} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', categoryStyle(f.category).dot)} />
                          <span className="min-w-0 flex-1 truncate text-slate-700">{f.title}</span>
                          {f.status !== 'ACTIVE' && <span className="text-[10px] uppercase text-slate-400">{t('draft')}</span>}
                        </label>
                      );
                    })}
                    {forms.length === 0 && <p className="px-2 py-4 text-center text-xs text-slate-400">{t('No forms yet.')}</p>}
                  </div>
                </div>
              )}
              {v.role === 'EDITOR' && v.formScope === 'SELECTED' && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <KeyRound className="h-3 w-3" /> {t('Forms this editor creates are added to their access automatically.')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
