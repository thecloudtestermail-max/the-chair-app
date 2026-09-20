// e2e/staff-dashboard.spec.ts
//
// Staff login → dashboard → every nav destination loads → create a
// barber and a service → the Priority 2 role guard (a non-admin
// deep-linking to an admin-only page gets an access-denied message, not
// a stuck skeleton).
import { test, expect } from '@playwright/test';
import { E2E_FIXTURE } from '../scripts/seed-e2e';

async function loginAsStaff(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${E2E_FIXTURE.tenantSlug}/dashboard$`));
}

test.describe('staff dashboard', () => {
  test('admin can log in and every nav destination loads', async ({ page }) => {
    await loginAsStaff(page, E2E_FIXTURE.adminEmail, E2E_FIXTURE.adminPassword);

    const nav = page.getByRole('navigation', { name: 'Dashboard navigation' });

    for (const [label, expectedHeading] of [
      ['Overview', 'Overview'],
      ['Appointments', 'Appointments'],
      ['Waitlist', 'Waitlist'],
      ['Services', 'Services'],
      ['Barbers', 'Barbers'],
      ['Customers', 'Customers'],
      ['Reviews', 'Reviews'],
      ['Analytics', 'Analytics'],
      ['Settings', 'Settings'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click();
      // Each dashboard page's own <h1> — a loose substring match is
      // intentional since several headings ("Today's..." etc) vary.
      await expect(page.locator('h1', { hasText: new RegExp(expectedHeading, 'i') })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('admin can add a barber and a service from the dashboard', async ({ page }) => {
    await loginAsStaff(page, E2E_FIXTURE.adminEmail, E2E_FIXTURE.adminPassword);
    const uniqueSuffix = Date.now();

    // --- Barber ---
    await page.getByRole('link', { name: 'Barbers' }).click();
    await page.getByRole('button', { name: 'Add barber' }).click();
    const barberName = `E2E Barber ${uniqueSuffix}`;
    await page.getByLabel('Name').fill(barberName);
    await page.getByRole('button', { name: 'Save barber' }).click();
    await expect(page.getByText(barberName)).toBeVisible();

    // --- Service ---
    await page.getByRole('link', { name: 'Services' }).click();
    await page.getByRole('button', { name: 'Add service' }).click();
    const serviceName = `E2E Service ${uniqueSuffix}`;
    await page.getByLabel('Name').fill(serviceName);
    await page.getByLabel('Price ($)').fill('45');
    await page.getByLabel('Duration (min)').fill('40');
    await page.getByRole('button', { name: 'Save service' }).click();
    await expect(page.getByText(serviceName)).toBeVisible();
  });

  test('receptionist deep-linking to an admin-only page sees "access denied", not a stuck skeleton', async ({ page }) => {
    await loginAsStaff(page, E2E_FIXTURE.receptionistEmail, E2E_FIXTURE.receptionistPassword);

    // Receptionist's nav shouldn't even show Analytics...
    const nav = page.getByRole('navigation', { name: 'Dashboard navigation' });
    await expect(nav.getByRole('link', { name: 'Analytics' })).toHaveCount(0);

    // ...but deep-linking there directly is the real regression this
    // guards: FIX_PLAN.md Priority 2.
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/dashboard/analytics`);
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });

  test('receptionist CAN reach Customers (shared role) — proves the guard is role-based, not "admin-only everywhere"', async ({ page }) => {
    await loginAsStaff(page, E2E_FIXTURE.receptionistEmail, E2E_FIXTURE.receptionistPassword);
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/dashboard/customers`);
    await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
    await expect(page.locator('h1', { hasText: 'Customers' })).toBeVisible();
  });
});
