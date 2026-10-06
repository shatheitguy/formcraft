export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'rating'
  | 'scale';

export interface FieldOption {
  id: string;
  /** Primary-language label; also the stored answer value. */
  label: string;
  /** Display-only label in the respondent's language (set at render time, never stored). */
  display?: string;
  /** Quiz mode: marks this option as a correct answer. */
  correct?: boolean;
  /** Quiz mode: points awarded when this option is selected. */
  points?: number;
}

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  /** radio / checkbox / select */
  options?: FieldOption[];
  /** rating / scale */
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface FormBranding {
  /** Uploaded image (/api/uploads/…) or absolute URL. */
  logoUrl?: string;
  /** Alignment of the whole header (logo, title, description). */
  logoAlign?: 'left' | 'center';
  /** Logo above the title (default) or beside it. */
  logoPlacement?: 'above' | 'inline';
  logoSize?: 'sm' | 'md' | 'lg';
  /** Hide the title on the form, e.g. when the logo already shows the name. */
  hideTitle?: boolean;
  /** Banner image shown at the top of the form. */
  coverUrl?: string;
  /** Accent palette key; empty means "use the workspace accent". */
  accent?: string;
}

export interface FormSettings {
  submitLabel: string;
  successMessage: string;
  /** Enables correct-answer and point tracking on choice fields. */
  quiz: boolean;
  showScore: boolean;
  branding?: FormBranding;
  /** Form languages; the first one is the primary language the form is written in. */
  languages?: string[];
  /** Colour theme for respondents: follow their device, or force light / dark. */
  theme?: 'auto' | 'light' | 'dark';
}

/** Per-language overrides. Anything missing falls back to the primary language. */
export interface FieldTranslation {
  label?: string;
  placeholder?: string;
  helpText?: string;
  minLabel?: string;
  maxLabel?: string;
  /** option id → label */
  options?: Record<string, string>;
}

export interface FormTranslation {
  title?: string;
  description?: string;
  submitLabel?: string;
  successMessage?: string;
  /** field id → overrides */
  fields?: Record<string, FieldTranslation>;
}

export interface FormSchema {
  fields: FormField[];
  settings: FormSettings;
  /** language code → translations of the form's text */
  translations?: Record<string, FormTranslation>;
}

export type FormStatus = 'DRAFT' | 'ACTIVE';

export type AnswerValue = string | string[] | number;
export type Answers = Record<string, AnswerValue>;

/** A form as it travels between server and client. */
export interface FormDTO {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: FormStatus;
  schema: FormSchema;
  slug: string | null;
  port: number | null;
  customDomain: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubmissionDTO {
  id: string;
  data: Answers;
  score: number | null;
  maxScore: number | null;
  language: string | null;
  createdAt: string;
}

export interface HubForm {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  status: FormStatus;
  fieldCount: number;
  quiz: boolean;
  responses: number;
  lastResponseAt: string | null;
  updatedAt: string;
  /** Daily response counts for the last 14 days, oldest first. */
  spark: number[];
  /** Whether the current user may edit/delete this form. */
  canEdit: boolean;
  logoUrl: string | null;
  slug: string | null;
  port: number | null;
  customDomain: string | null;
}
