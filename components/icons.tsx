import {
  AlignLeft,
  Briefcase,
  CalendarDays,
  CalendarCheck,
  ChevronDownCircle,
  CircleDot,
  FileCheck2,
  FilePlus2,
  Frown,
  Headset,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageSquareHeart,
  Paperclip,
  Phone,
  Plane,
  ScrollText,
  ShoppingCart,
  SlidersHorizontal,
  SmilePlus,
  Star,
  Trophy,
  Type,
  UserPlus,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { logoSvgBody } from '@/lib/logo-svg';
import type { FieldType } from '@/lib/types';
import type { TemplateId } from '@/lib/templates';

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  email: Mail,
  phone: Phone,
  radio: CircleDot,
  checkbox: ListChecks,
  select: ChevronDownCircle,
  date: CalendarDays,
  rating: Star,
  scale: SlidersHorizontal,
  terms: ScrollText,
  file: Paperclip,
};

export const TEMPLATE_ICONS: Record<TemplateId, LucideIcon> = {
  blank: FilePlus2,
  contact: LifeBuoy,
  feedback: MessageSquareHeart,
  event: CalendarCheck,
  quiz: Trophy,
  job: Briefcase,
  registration: UserPlus,
  order: ShoppingCart,
  leave: Plane,
  'it-support': Headset,
  complaint: Frown,
  survey: SmilePlus,
  visitor: UserRoundCheck,
  consent: FileCheck2,
};

export function Logo({ className = 'h-8 w-8', src }: { className?: string; src?: string }) {
  // Unique per instance: a shared gradient id breaks when the first instance is display:none.
  const gid = `fc-logo${useId().replace(/:/g, '')}`;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`${className} rounded-lg object-contain`} />;
  }
  // Follows the active accent (workspace or per-form colour) through CSS variables.
  const body = logoSvgBody({ light: 'rgb(var(--brand-400))', mid: 'rgb(var(--brand-600))', dark: 'rgb(var(--brand-800))' }, gid);
  return <svg viewBox="0 0 32 32" className={className} aria-hidden dangerouslySetInnerHTML={{ __html: body }} />;
}
