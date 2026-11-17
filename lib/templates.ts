import { DEFAULT_AGREE_LABEL, DEFAULT_SETTINGS, opt } from './fields';
import type { FormField, FormSchema } from './types';
import { uid } from './utils';

export type TemplateId =
  | 'blank'
  | 'contact'
  | 'feedback'
  | 'event'
  | 'quiz'
  | 'job'
  | 'registration'
  | 'order'
  | 'leave'
  | 'it-support'
  | 'complaint'
  | 'survey'
  | 'visitor'
  | 'consent';

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

/** A required terms & conditions field with the given text. */
const terms = (text: string, extra: Partial<Omit<FormField, 'id' | 'type'>> = {}): FormField =>
  f({ type: 'terms', label: 'Terms & conditions', required: true, terms: text, agreeLabel: DEFAULT_AGREE_LABEL, ...extra });

const PRIVACY_TERMS = `1. The information you submit is used only to handle this request and the services related to it.
2. We store your details securely and keep them only as long as needed for that purpose or as required by law.
3. We do not sell your personal information or share it with third parties, except service providers acting on our behalf.
4. You may ask us at any time to see, correct, or delete the information we hold about you.
5. By submitting this form you confirm that the information you provide is accurate and complete.`;

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
  {
    id: 'job',
    name: 'Job Application',
    tagline: 'Collect applications with experience and a cover letter.',
    title: 'Job Application',
    description: 'Thanks for your interest in joining our team. Please complete the form below and we will be in touch.',
    category: 'HR',
    tags: ['hiring', 'jobs', 'recruitment'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@example.com', required: true }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: true }),
        f({
          type: 'select',
          label: 'Position applied for',
          required: true,
          options: [opt('Sales Associate'), opt('Customer Service Representative'), opt('Software Developer'), opt('Accountant'), opt('Operations Coordinator'), opt('Other')],
        }),
        f({
          type: 'select',
          label: 'Years of relevant experience',
          required: true,
          options: [opt('Less than 1 year'), opt('1–3 years'), opt('3–5 years'), opt('5–10 years'), opt('More than 10 years')],
        }),
        f({
          type: 'textarea',
          label: 'Cover letter',
          helpText: 'Tell us why you are a good fit for this role.',
          placeholder: 'A few paragraphs about your experience and motivation…',
          required: false,
        }),
        f({ type: 'date', label: 'Earliest start date', required: false }),
        terms(
          `1. I confirm that the information in this application is true and complete to the best of my knowledge.
2. I understand that false or misleading information may lead to my application being rejected or my employment being ended.
3. I allow the company to contact the references I provide and to verify the details in this application.
4. My details will be kept for up to 12 months for recruitment purposes and then deleted, unless I ask for earlier deletion.`,
          { label: 'Applicant declaration', agreeLabel: 'I confirm the declaration above and consent to my data being used for recruitment' },
        ),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Submit application',
        successMessage: 'Thank you for applying! Our hiring team will review your application and contact you if you are shortlisted.',
      },
    }),
  },
  {
    id: 'registration',
    name: 'Customer Registration',
    tagline: 'Sign up new customers or members with consent.',
    title: 'Customer Registration',
    description: 'Register with us to receive updates, offers, and member services.',
    category: 'Registration',
    tags: ['registration', 'customers', 'members', 'sign-up'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@example.com', required: true }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: true }),
        f({ type: 'text', label: 'Company / Organization', placeholder: 'Acme Inc.', helpText: 'Leave empty if you are registering as an individual.', required: false }),
        f({ type: 'textarea', label: 'Address', placeholder: 'Street, city, postal code, country', required: false }),
        f({
          type: 'select',
          label: 'How did you hear about us?',
          required: false,
          options: [opt('Search engine'), opt('Social media'), opt('Friend or colleague'), opt('Advertisement'), opt('Event'), opt('Other')],
        }),
        terms(PRIVACY_TERMS),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Register',
        successMessage: 'Welcome aboard! Your registration is complete.',
      },
    }),
  },
  {
    id: 'order',
    name: 'Order / Service Request',
    tagline: 'Take orders or service bookings with a delivery date.',
    title: 'Order / Service Request',
    description: 'Tell us what you need and when, and we will confirm your order shortly.',
    category: 'Sales',
    tags: ['order', 'booking', 'sales', 'service'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@example.com', required: true }),
        f({
          type: 'select',
          label: 'Product / service',
          required: true,
          options: [opt('Standard package'), opt('Premium package'), opt('Installation service'), opt('Maintenance visit'), opt('Custom request')],
        }),
        f({ type: 'text', label: 'Quantity', placeholder: 'e.g. 2', required: true }),
        f({ type: 'date', label: 'Preferred delivery date', required: false }),
        f({ type: 'textarea', label: 'Notes', placeholder: 'Delivery address, special instructions, or anything else we should know…', required: false }),
        terms(
          `1. Orders are confirmed only after we contact you with the final price and availability.
2. Prices include applicable taxes unless stated otherwise. Delivery fees, if any, are shown in the confirmation.
3. You may cancel free of charge up to 24 hours before the scheduled delivery or service date.
4. Delivery dates are estimates; we will let you know promptly about any delay.
5. Your contact details are used only to process and deliver this order.`,
        ),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Place request',
        successMessage: 'Thanks! We have received your request and will contact you to confirm the details.',
      },
    }),
  },
  {
    id: 'leave',
    name: 'Leave Request',
    tagline: 'Employee time-off requests with dates and leave type.',
    title: 'Leave Request',
    description: 'Submit your leave request at least two weeks in advance where possible. Your manager will be notified.',
    category: 'HR',
    tags: ['hr', 'leave', 'time-off', 'employees'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Employee name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'text', label: 'Employee ID', placeholder: 'e.g. EMP-1024', required: true }),
        f({
          type: 'select',
          label: 'Department',
          required: true,
          options: [opt('Administration'), opt('Finance'), opt('Human Resources'), opt('IT'), opt('Operations'), opt('Sales & Marketing'), opt('Other')],
        }),
        f({
          type: 'radio',
          label: 'Leave type',
          required: true,
          options: [opt('Annual leave'), opt('Sick leave'), opt('Emergency leave'), opt('Unpaid leave'), opt('Other')],
        }),
        f({ type: 'date', label: 'From date', helpText: 'First day of leave.', required: true }),
        f({ type: 'date', label: 'To date', helpText: 'Last day of leave.', required: true }),
        f({ type: 'textarea', label: 'Reason', placeholder: 'Briefly describe the reason for your leave…', required: false }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Submit request',
        successMessage: 'Your leave request has been submitted. You will be notified once it is reviewed.',
      },
    }),
  },
  {
    id: 'it-support',
    name: 'IT Support Ticket',
    tagline: 'Helpdesk tickets with category and priority.',
    title: 'IT Support Ticket',
    description: 'Having trouble with a device, software, or access? Open a ticket and the IT team will help.',
    category: 'Support',
    tags: ['it', 'helpdesk', 'ticket', 'support'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@company.com', required: true }),
        f({ type: 'text', label: 'Department', placeholder: 'e.g. Finance', required: false }),
        f({
          type: 'select',
          label: 'Category',
          required: true,
          options: [opt('Hardware'), opt('Software'), opt('Network'), opt('Access'), opt('Other')],
        }),
        f({
          type: 'radio',
          label: 'Priority',
          helpText: 'Critical means you cannot work at all.',
          required: true,
          options: [opt('Low'), opt('Medium'), opt('High'), opt('Critical')],
        }),
        f({
          type: 'textarea',
          label: 'Description',
          placeholder: 'What happened? Include any error messages and the steps you already tried…',
          required: true,
        }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Open ticket',
        successMessage: 'Your ticket has been logged. The IT team will get back to you as soon as possible.',
      },
    }),
  },
  {
    id: 'complaint',
    name: 'Complaint Form',
    tagline: 'Record complaints with incident details and desired outcome.',
    title: 'Complaint Form',
    description: 'We are sorry something went wrong. Please share the details so we can make it right.',
    category: 'Support',
    tags: ['complaint', 'customers', 'support'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@example.com', required: true }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: false }),
        f({
          type: 'select',
          label: 'Complaint type',
          required: true,
          options: [opt('Product quality'), opt('Service'), opt('Billing'), opt('Delivery'), opt('Staff behaviour'), opt('Other')],
        }),
        f({ type: 'date', label: 'Date of incident', required: false }),
        f({ type: 'textarea', label: 'Complaint details', placeholder: 'Describe what happened, including names, order numbers, or locations if relevant…', required: true }),
        f({ type: 'textarea', label: 'Desired resolution', helpText: 'How would you like us to resolve this?', placeholder: 'e.g. refund, replacement, apology…', required: false }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Submit complaint',
        successMessage: 'Thank you for letting us know. We will review your complaint and respond within 3 business days.',
      },
    }),
  },
  {
    id: 'survey',
    name: 'Customer Satisfaction Survey',
    tagline: 'Rating, NPS 0–10, and what customers liked.',
    title: 'Customer Satisfaction Survey',
    description: 'Your opinion matters. This short survey helps us serve you better.',
    category: 'Feedback',
    tags: ['survey', 'csat', 'nps', 'customers'],
    build: () => ({
      fields: [
        f({ type: 'rating', label: 'Overall, how satisfied are you with our service?', required: true, min: 1, max: 5 }),
        f({
          type: 'scale',
          label: 'How likely are you to recommend us to a friend or colleague?',
          required: true,
          min: 0,
          max: 10,
          minLabel: 'Not at all likely',
          maxLabel: 'Extremely likely',
        }),
        f({
          type: 'checkbox',
          label: 'What did you like?',
          helpText: 'Select all that apply.',
          required: false,
          options: [opt('Quality'), opt('Price'), opt('Speed of service'), opt('Friendly staff'), opt('Ease of use'), opt('Other')],
        }),
        f({ type: 'textarea', label: 'Any suggestions for improvement?', placeholder: 'Share your ideas…', required: false }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Send survey',
        successMessage: 'Thank you for taking the time to share your feedback!',
      },
    }),
  },
  {
    id: 'visitor',
    name: 'Visitor Registration',
    tagline: 'Front-desk sign-in with host, purpose, and safety rules.',
    title: 'Visitor Registration',
    description: 'Welcome! Please register before your visit. Your host will be notified when you arrive.',
    category: 'Registration',
    tags: ['visitor', 'reception', 'sign-in'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'phone', label: 'Phone number', placeholder: '+1 555 123 4567', required: true }),
        f({ type: 'text', label: 'Company', placeholder: 'Acme Inc.', required: false }),
        f({ type: 'text', label: 'Person to meet', placeholder: 'Name of your host', required: true }),
        f({
          type: 'select',
          label: 'Purpose of visit',
          required: true,
          options: [opt('Meeting'), opt('Interview'), opt('Delivery'), opt('Maintenance / contractor'), opt('Other')],
        }),
        f({ type: 'date', label: 'Visit date', required: true }),
        terms(
          `1. Wear your visitor badge at all times and return it when you leave.
2. Stay with your host and do not enter restricted areas without permission.
3. Follow all safety signs and instructions from staff, including during an emergency evacuation.
4. Photography and recording are not allowed without prior approval.
5. Your details are kept in the visitor log for security purposes for up to 30 days.`,
          { label: 'Visitor safety rules', agreeLabel: 'I have read and will follow the visitor safety rules' },
        ),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'Register visit',
        successMessage: 'You are registered. Please show this confirmation at reception.',
      },
    }),
  },
  {
    id: 'consent',
    name: 'Terms & Consent',
    tagline: 'Have people read and accept your terms and conditions.',
    title: 'Terms & Consent Form',
    description: 'Please read the terms below carefully and confirm your agreement.',
    category: 'Legal',
    tags: ['terms', 'consent', 'agreement', 'legal'],
    build: () => ({
      fields: [
        f({ type: 'text', label: 'Full name', placeholder: 'Jane Doe', required: true }),
        f({ type: 'email', label: 'Email address', placeholder: 'jane@example.com', required: true }),
        terms(
          `1. Acceptance. By accepting these terms you agree to be bound by them. If you do not agree, please do not submit this form.
2. Services. We will provide the services described to you in good faith and with reasonable care and skill.
3. Your responsibilities. You agree to provide accurate information and to keep us informed of any changes.
4. Fees and payment. Any fees will be communicated in advance. Payment is due within 30 days of the invoice date unless agreed otherwise.
5. Privacy. We handle your personal information in line with our privacy policy and applicable data protection laws.
6. Cancellation. Either party may end this agreement with 14 days' written notice.
7. Liability. To the extent permitted by law, our liability is limited to the amount paid for the services.
8. Changes. We may update these terms from time to time and will notify you of significant changes.
9. Governing law. These terms are governed by the laws of the place where we operate.`,
        ),
        f({ type: 'date', label: 'Date', required: true }),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        submitLabel: 'I agree & submit',
        successMessage: 'Thank you. Your agreement has been recorded.',
      },
    }),
  },
];

export function getTemplate(id: string | undefined) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
