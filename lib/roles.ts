// Shared between server and client: role definitions and permission checks.

export type Role = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type FormScope = 'ALL' | 'SELECTED';

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  formScope: FormScope;
  formIds: string[];
}

export const ROLE_INFO: Record<Role, { label: string; description: string; tone: string }> = {
  ADMIN: {
    label: 'Admin',
    description: 'Full access to every form, users, and workspace settings.',
    tone: 'bg-brand-50 text-brand-700 ring-brand-200',
  },
  EDITOR: {
    label: 'Editor',
    description: 'Create, edit, publish and delete forms, and manage their submissions.',
    tone: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  VIEWER: {
    label: 'Viewer',
    description: 'Read-only: view submissions, insights and export reports.',
    tone: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
};

export const ROLES = Object.keys(ROLE_INFO) as Role[];

const inScope = (u: SessionUser, formId: string) => u.role === 'ADMIN' || u.formScope === 'ALL' || u.formIds.includes(formId);

export const canCreateForms = (u: SessionUser) => u.role !== 'VIEWER';
export const canViewForm = (u: SessionUser, formId: string) => inScope(u, formId);
export const canEditForm = (u: SessionUser, formId: string) => u.role !== 'VIEWER' && inScope(u, formId);

/** Prisma `where` restricting forms to what the user may see. */
export const formWhere = (u: SessionUser) => (u.role === 'ADMIN' || u.formScope === 'ALL' ? {} : { id: { in: u.formIds } });

export const initials = (name: string, fallback: string) =>
  (name.trim() || fallback)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
