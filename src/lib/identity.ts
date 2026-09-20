// src/lib/identity.ts
//
// Input normalisation shared by every route that touches an email, phone or
// URL-safe name. Emails are stored and looked up lower-cased so
// "Quano@Chair.app" and "quano@chair.app" are one person.

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPhone(value: string): boolean {
  return /^[0-9+()\-.\s]{7,20}$/.test(value);
}

export function slugify(value: string): string {
  const s = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'barber';
}

/** Only same-site paths are honoured as a post-sign-in destination (no open redirects). */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}
