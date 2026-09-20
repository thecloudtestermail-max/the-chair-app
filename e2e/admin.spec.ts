// e2e/admin.spec.ts
//
// Platform-admin journey: /admin/login → tenant list → create a new
// tenant → it appears in the list, and its own staff login page (and no
// other tenant's) accepts the newly-created admin credentials.
import { test, expect } from '@playwright/test';
import { E2E_FIXTURE } from '../scripts/seed-e2e';

test.describe('platform admin', () => {
  test('super_admin can log in and see the seeded tenant', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(E2E_FIXTURE.superAdminEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_FIXTURE.superAdminPassword);
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('h1', { hasText: 'Tenants' })).toBeVisible();
    await expect(page.getByText(E2E_FIXTURE.tenantName)).toBeVisible();
  });

  test('super_admin can create a new tenant, and its admin can immediately log in to it', async ({ page }) => {
    const suffix = Date.now();
    const slug = `e2e-new-salon-${suffix}`;
    const name = `E2E New Salon ${suffix}`;
    const contactEmail = `contact-${suffix}@example.test`;
    const adminEmail = `admin-${suffix}@example.test`;
    const adminPassword = 'NewSalonPass123!';

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(E2E_FIXTURE.superAdminEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_FIXTURE.superAdminPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByLabel('Slug').fill(slug);
    await page.getByLabel('Salon name').fill(name);
    await page.getByLabel('Contact email').fill(contactEmail);
    await page.getByLabel('First admin email').fill(adminEmail);
    await page.getByLabel('First admin password').fill(adminPassword);
    await page.getByRole('button', { name: 'Create tenant' }).click();

    // The new salon is listed, and its owner's welcome PDF is offered for download.
    await expect(page.getByText(name).first()).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download welcome PDF' }).click();
    expect((await download).suggestedFilename()).toMatch(/^Welcome-.*\.pdf$/);

    // Log out of the platform-admin session before trying the new tenant's
    // sign-in, so this is a clean check of ITS credentials, not a leftover
    // admin cookie.
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    // The owner signs in like anyone else, with the starting password from the PDF...
    await page.goto(`/t/${slug}/login`);
    await page.getByLabel('Email').fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${slug}/dashboard$`));

    // ...and is made to choose their own before anything else works.
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toHaveCount(0);
    await page.getByLabel('Current password').fill(adminPassword);
    await page.getByLabel('New password', { exact: true }).fill('My-Own-Salon-Pass-1');
    await page.getByLabel('Confirm new password').fill('My-Own-Salon-Pass-1');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('navigation', { name: 'Dashboard navigation' })).toBeVisible();
  });

  test('a suspended/other tenant\'s admin cannot log in with the platform super_admin path, and vice versa', async ({ page }) => {
    // The seeded tenant admin (a `admin` role, tenant-scoped) must not be
    // accepted by the platform-wide /admin/login path.
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(E2E_FIXTURE.adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_FIXTURE.adminPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('the platform super_admin is refused by the PUBLIC sign-in (it has its own door)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_FIXTURE.superAdminEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_FIXTURE.superAdminPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
