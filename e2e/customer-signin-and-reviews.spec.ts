// e2e/customer-signin-and-reviews.spec.ts
//
// The returning-customer journey: sign in with email + password (the same
// form staff use), see the seeded completed
// appointment, leave a review, and confirm a staff admin can then flag
// it from the dashboard. Also covers favoriting a salon from the
// discovery homepage, which uses the same sign-in modal.
import { test, expect } from '@playwright/test';
import { E2E_FIXTURE } from '../scripts/seed-e2e';
import { completeSignInModal, signInAsCustomer } from './helpers/customerAuth';

test.describe('customer sign-in, reviews, and favorites', () => {
  test('a returning customer can sign in, see their completed visit, and leave a review', async ({ page }) => {
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/appointments`);
    await expect(page.getByText('Sign in to see your appointments')).toBeVisible();

    await signInAsCustomer(page, E2E_FIXTURE.reviewCustomerEmail, E2E_FIXTURE.reviewCustomerPassword);

    await expect(page.locator('h1', { hasText: 'My appointments' })).toBeVisible();
    await expect(page.getByText(E2E_FIXTURE.serviceName)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leave a review' })).toBeVisible();

    await page.getByRole('button', { name: 'Leave a review' }).click();
    await expect(page.getByRole('dialog', { name: 'Leave a review' })).toBeVisible();

    // Rating defaults to 5 stars — just add a comment and submit.
    await page.getByLabel('Comments (optional)').fill('Great haircut, seeded by the E2E suite.');
    await page.getByRole('button', { name: 'Submit review' }).click();

    await expect(page.getByRole('dialog', { name: 'Leave a review' })).toHaveCount(0);
    // The button is replaced by a status badge once reviewed, in the same session.
    await expect(page.getByRole('button', { name: 'Leave a review' })).toHaveCount(0);
  });

  test('submitting a second review for the same appointment is rejected (one review per visit)', async ({ page }) => {
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/appointments`);
    await signInAsCustomer(page, E2E_FIXTURE.reviewCustomerEmail, E2E_FIXTURE.reviewCustomerPassword);

    // The previous test already reviewed this appointment and the UI now
    // hides the button for the rest of that session, so hit the API
    // directly with the same signed-in cookie to prove the SERVER also
    // rejects a duplicate, not just the UI.
    const myAppointments = await (await page.request.get(`/api/t/${E2E_FIXTURE.tenantSlug}/my-appointments`)).json();
    const reviewedAppt = myAppointments.appointments.find((a: any) => a.status === 'completed');

    const res = await page.request.post('/api/reviews', {
      data: { appointmentId: reviewedAppt._id, rating: 1, text: 'Trying to review twice' },
    });
    expect(res.status()).toBe(409);
  });

  test('staff admin can see and flag the submitted review from the dashboard', async ({ page }) => {
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}/login`);
    await page.getByLabel('Email').fill(E2E_FIXTURE.adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(E2E_FIXTURE.adminPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${E2E_FIXTURE.tenantSlug}/dashboard$`));

    await page.getByRole('link', { name: 'Reviews' }).click();
    await expect(page.locator('h1', { hasText: 'Reviews' })).toBeVisible();
    await expect(page.getByText(E2E_FIXTURE.reviewCustomerName)).toBeVisible();
    await expect(page.getByText('Visible')).toBeVisible();

    await page.getByRole('button', { name: 'Flag' }).click();
    await expect(page.getByText('Flagged')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unflag' })).toBeVisible();
  });

  test('favoriting a salon from the discovery homepage prompts sign-in, then persists', async ({ page, request }) => {
    const favoriteCustomerEmail = `e2e-favoriter-${Date.now()}@example.test`;

    // Register through the API with the standalone `request` fixture (its
    // cookies are NOT shared with the browser page), so the browser starts
    // signed out and the sign-in pop-up is what gets exercised below.
    const favoriteCustomerPassword = 'Favoriter-Pass-123';
    const registered = await request.post('/api/auth/register', {
      data: { name: 'Favoriter', email: favoriteCustomerEmail, phone: '555 010 0177', password: favoriteCustomerPassword },
    });
    expect(registered.status()).toBe(201);

    await page.goto('/');
    const tenantLink = page.getByRole('link', { name: new RegExp(E2E_FIXTURE.tenantName) });
    const tenantCard = tenantLink.locator('xpath=..'); // the tenantCardWrap div — link and favorite button are siblings under it
    const favoriteButton = tenantCard.getByRole('button', { name: /Save .* as favorite/ });
    await favoriteButton.click();

    // Signing in (no separate "Sign in" trigger click here — requireSignIn
    // opens the modal directly) completes the pending favorite action.
    await completeSignInModal(page, favoriteCustomerEmail, favoriteCustomerPassword);

    await expect(tenantCard.getByRole('button', { name: /Remove .* from favorites/ })).toBeVisible();

    // Persists across a reload.
    await page.reload();
    const tenantCardAfterReload = page.getByRole('link', { name: new RegExp(E2E_FIXTURE.tenantName) }).locator('xpath=..');
    await expect(tenantCardAfterReload.getByRole('button', { name: /Remove .* from favorites/ })).toBeVisible();
  });

  test('a new customer can create an account from the sign-in pop-up and is signed in straight away', async ({ page }) => {
    const email = `e2e-newcustomer-${Date.now()}@example.test`;
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: /Create an account/ }).click();

    await page.getByLabel('Full name').fill('New Customer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Phone number').fill('555 010 0188');
    await page.getByLabel('Password', { exact: true }).fill('New-Customer-Pass1');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page.getByText('Hi, New')).toBeVisible();
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('New Customer');
  });

  test('"Forgot password" without email configured tells the person to email support', async ({ page }) => {
    await page.goto(`/t/${E2E_FIXTURE.tenantSlug}`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await page.getByLabel('Email').fill(E2E_FIXTURE.reviewCustomerEmail);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    // The e2e environment has no EmailJS credentials, so this is the manual path.
    await expect(page.getByRole('status')).toContainText('geehyness22@gmail.com');
  });
});
