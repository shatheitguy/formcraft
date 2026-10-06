import { DEFAULT_SETTINGS, opt } from './fields';
import type { FormField, FormSchema } from './types';
import { uid } from './utils';

export type TemplateId = 'blank' | 'contact' | 'feedback' | 'event' | 'quiz';

export interface FormTemplate {
  id: TemplateId;
  name: string;
  tagline: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  build: () => FormSchema;
}

const f = (field: Omit<FormField, 'id'>): FormField => ({ id: uid('f_'), ...field });

export const TEMPLATES: FormTemplate[] = [
  {
    id: 'blank',
    name: 'Blank form',
    tagline: 'Start from scratch with an empty canvas.',
    title: 'Untitled form',
    description: '',
    category: 'General',
    tags: [],
    build: () => ({ fields: [], settings: { ...DEFAULT_SETTINGS } }),
  },
  {
    id: 'contact',
    name: 'Contact & Support',
    tagline: 'Collect support requests with priority triage.',
    title: 'Contact & Support',
    description: "Have a question or running into an issue? Send us a message and we'll get back to you shortly.",
    category: 'Support',
    tags: ['support', 'contact', 'helpdesk'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@company.com', required: true }),
        f({
          type: 'select',
          label: 'Priority',
          helpText: 'How urgent is your request?',
          required: true,
          options: [opt('Low'), opt('Normal'), opt('High'), opt('Urgent')],
        }),
        f({
          type: 'textarea',
          label: 'Message',
          placeholder: 'Describe your question or issue in as much detail as possible…',
          required: true,
        }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Send message',
        successMessage: "Thanks for reaching out! Our support team will reply within one business day.",
      },
    }),
  },
  {
    id: 'feedback',
    name: 'Customer Feedback',
    tagline: 'NPS score, product rating, and open feedback.',
    title: 'Customer Feedback Survey',
    description: 'Help us improve! This survey takes less than two minutes.',
    category: 'Feedback',
    tags: ['nps', 'survey', 'customers'],
    build: () => ({
      fields: [
        f({
          type: 'scale',
          label: 'How likely are you to recommend us to a friend or colleague?',
          required: true,
          min: 1,
          max: 10,
          minLabel: 'Not at all likely',
          maxLabel: 'Extremely likely',
        }),
        f({
          type: 'radio',
          label: 'How would you rate the product overall?',
          required: true,
          options: [opt('Excellent'), opt('Good'), opt('Average'), opt('Poor'), opt('Very poor')],
        }),
        f({
          type: 'textarea',
          label: 'What could we do better?',
          placeholder: 'Share any thoughts, ideas, or frustrations…',
          required: false,
        }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Send feedback',
        successMessage: 'Thank you — your feedback goes straight to our product team.',
      },
    }),
  },
  {
    id: 'event',
    name: 'Event Registration',
    tagline: 'RSVPs with session date and dietary needs.',
    title: 'Event Registration',
    description: 'Reserve your spot! Please register at least 48 hours before your chosen session.',
    category: 'Events',
    tags: ['event', 'rsvp', 'registration'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@company.com', required: true }),
        f({ type: 'text', label: 'Company / Organization', placeholder: 'Acme Inc.', required: false }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: false }),
        f({ type: 'date', label: 'Preferred session date', required: true }),
        f({
          type: 'checkbox',
          label: 'Food preferences',
          helpText: 'Select all that apply.',
          required: false,
          options: [
            opt('Vegetarian'),
            opt('Vegan'),
            opt('Gluten-free'),
            opt('Halal'),
            opt('Kosher'),
            opt('No preference'),
          ],
        }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Register',
        successMessage: "You're registered! A confirmation will be sent to your email.",
      },
    }),
  },
  {
    id: 'quiz',
    name: 'Quiz / Poll',
    tagline: 'Auto-scored questions with correct answers.',
    title: 'General Knowledge Quiz',
    description: 'Three quick questions — see how you score!',
    category: 'Quiz',
    tags: ['quiz', 'poll', 'trivia'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Your name', placeholder: 'Nickname is fine', required: true }),
        f({
          type: 'radio',
          label: 'What does HTML stand for?',
          required: true,
          options: [
            opt('Hyper Text Markup Language', { correct: true, points: 10 }),
            opt('High Tech Modern Language', { points: 0 }),
            opt('Hyperlink and Text Management Language', { points: 0 }),
            opt('Home Tool Markup Language', { points: 0 }),
          ],
        }),
        f({
          type: 'radio',
          label: 'Which planet is known as the Red Planet?',
          required: true,
          options: [
            opt('Venus', { points: 0 }),
            opt('Mars', { correct: true, points: 10 }),
            opt('Jupiter', { points: 0 }),
            opt('Mercury', { points: 0 }),
          ],
        }),
        f({
          type: 'radio',
          label: 'What is 7 × 8?',
          required: true,
          options: [
            opt('54', { points: 0 }),
            opt('56', { correct: true, points: 10 }),
            opt('58', { points: 0 }),
            opt('64', { points: 0 }),
          ],
        }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        quiz: true,
        showScore: true,
        submitLabel: 'Submit answers',
        successMessage: 'Thanks for playing!',
      },
    }),
  },
];

export function getTemplate(id: string | undefined) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
