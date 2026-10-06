import {
  AlignLeft,
  CalendarDays,
  CalendarCheck,
  ChevronDownCircle,
  CircleDot,
  FilePlus2,
  LifeBuoy,
  ListChecks,
  Mail,
  MessageSquareHeart,
  Phone,
  SlidersHorizontal,
  Star,
  Trophy,
  Type,
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
};

export const TEMPLATE_ICONS: Record<TemplateId, LucideIcon> = {
  blank: FilePlus2,
  contact: LifeBuoy,
  feedback: MessageSquareHeart,
  event: CalendarCheck,
  quiz: Trophy,
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
