// src/lib/support.ts
//
// Where a user goes when self-service password reset isn't available (no
// email provider configured). Overridable per deployment with SUPPORT_EMAIL.
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'geehyness22@gmail.com';

/** Shown instead of "check your email" whenever reset email can't be sent. */
export function manualResetMessage(): string {
  return `Password reset by email isn't set up yet. Please email ${SUPPORT_EMAIL} from the address on your account and we'll reset your password for you.`;
}
