// src/lib/password.ts
//
// One password policy for every account type (customers, receptionists,
// barbers, salon owners), plus the generator for the temporary passwords
// printed in a new user's welcome PDF.
import crypto from 'crypto';

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt silently ignores everything past 72 bytes, so longer input would
// give a false sense of strength.
export const MAX_PASSWORD_LENGTH = 72;

// Deliberately short: catches the passwords people actually try first, and
// stays out of the way of everything else (no composition rules).
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein123',
  'abc12345', '11111111', '00000000', 'changeme', 'chairapp', 'barbershop',
]);

/** Returns a human-readable problem, or null when the password is acceptable. */
export function validatePassword(password: unknown, email?: string): string | null {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
  const lower = password.toLowerCase();
  if (email && lower === email.trim().toLowerCase()) return "Password can't be the same as your email";
  if (COMMON.has(lower)) return 'That password is too common. Choose something harder to guess';
  return null;
}

// No 0/O, 1/I/l: meant to be read off a printed page or a screen.
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** e.g. "K7QM-X2PD-9WTA": 12 characters, about 59 bits. */
export function generateTempPassword(): string {
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) chars.push(TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
}
