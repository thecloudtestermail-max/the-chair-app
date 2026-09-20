// e2e/helpers/customerAuth.ts
import { Page } from '@playwright/test';

/**
 * Fills the shared sign-in form (the pop-up on public pages, or the full page)
 * with email + password and submits. Customers sign in exactly like staff:
 * there is no emailed code any more. `{ exact: true }` matters: the password
 * field has a "Show password" toggle whose aria-label would otherwise also
 * match a plain "Password" label lookup.
 */
export async function completeSignInModal(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** Opens the sign-in pop-up from a header "Sign in" button and completes it. */
export async function signInAsCustomer(page: Page, email: string, password: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await completeSignInModal(page, email, password);
}
