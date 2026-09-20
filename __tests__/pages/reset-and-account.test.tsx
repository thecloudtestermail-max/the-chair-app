// __tests__/pages/reset-and-account.test.tsx
//
// The emailed reset link's landing page, the Account panel, and the forced
// change-password screen.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../helpers/fetchMock';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useParams: () => ({ tenantSlug: 'demo' }) }));

import ResetPasswordPage from '@/app/reset-password/page';
import { AccountPanel } from '@/components/auth/AccountPanel';
import { ForcedPasswordChange } from '@/components/auth/ForcedPasswordChange';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  router.refresh.mockClear();
  window.history.replaceState(null, '', '/');
});

describe('Reset password page', () => {
  it('reads the token from the URL fragment, removes it from the address bar, and posts it', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abc123&from=demo');
    const fetchMock = mockFetch({ '/api/auth/reset': () => ({ json: { message: 'ok' } }) });
    render(<ResetPasswordPage />);

    await userEvent.type(await screen.findByLabelText('New password'), 'Fresh-Pass-123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Fresh-Pass-123');
    expect(window.location.hash).toBe(''); // token no longer in the URL
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByRole('status')).toHaveTextContent('updated');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'abc123', password: 'Fresh-Pass-123' });
    // Sends them back to THAT salon's sign-in.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/t/demo/login');
  });

  it('refuses mismatched passwords without calling the server', async () => {
    window.history.replaceState(null, '', '/reset-password#token=abc123');
    const fetchMock = mockFetch({ '/api/auth/reset': () => ({ json: {} }) });
    render(<ResetPasswordPage />);
    await userEvent.type(await screen.findByLabelText('New password'), 'Fresh-Pass-123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Different-456');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("don't match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a link with no token explains itself', async () => {
    render(<ResetPasswordPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/missing or incomplete/i);
  });

  it('shows the server message for an expired link', async () => {
    window.history.replaceState(null, '', '/reset-password#token=old');
    mockFetch({ '/api/auth/reset': () => ({ status: 400, json: { message: 'This reset link is invalid or has expired. Request a new one.' } }) });
    render(<ResetPasswordPage />);
    await userEvent.type(await screen.findByLabelText('New password'), 'Fresh-Pass-123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Fresh-Pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
  });
});

describe('AccountPanel', () => {
  it('customer: edits name and phone (email is read-only) and saves via PATCH', async () => {
    const fetchMock = mockFetch({
      '/api/customer-auth/me': (url, init) =>
        init?.method === 'PATCH'
          ? { json: { name: 'Jamie R', email: 'jamie@example.test', phone: '555 010 0100' } }
          : { json: { customerId: 'c1', name: 'Jamie', email: 'jamie@example.test', phone: '555 010 0100' } },
    });
    render(<AccountPanel kind="customer" tenantSlug="demo" />);
    const name = await screen.findByLabelText('Full name');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    await userEvent.clear(name);
    await userEvent.type(name, 'Jamie R');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    const patch = fetchMock.mock.calls.find((c: any) => c[1]?.method === 'PATCH');
    expect(JSON.parse(patch![1].body)).toEqual({ name: 'Jamie R', phone: '555 010 0100' });
  });

  it('signed out: offers a sign-in link for that salon', async () => {
    mockFetch({ '/api/customer-auth/me': () => ({ status: 401, json: {} }) });
    render(<AccountPanel kind="customer" tenantSlug="demo" />);
    expect(await screen.findByRole('link')).toHaveAttribute('href', '/t/demo/login');
  });

  it('staff: shows their role and the change-password form', async () => {
    mockFetch({ '/api/auth/verify': () => ({ json: { role: 'barber', subjectType: 'user', tenantSlug: 'demo' } }) });
    render(<AccountPanel kind="staff" tenantSlug="demo" />);
    expect(await screen.findByText('Barber')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('changing password posts current + new, and reports the server error for a wrong current one', async () => {
    let calls = 0;
    const fetchMock = mockFetch({
      '/api/auth/verify': () => ({ json: { role: 'admin', subjectType: 'user' } }),
      '/api/auth/password': () => (++calls === 1 ? { status: 400, json: { message: 'Your current password is incorrect' } } : { json: { message: 'Password updated.' } }),
    });
    render(<AccountPanel kind="staff" tenantSlug="demo" />);
    await userEvent.type(await screen.findByLabelText('Current password'), 'wrong-old');
    await userEvent.type(screen.getByLabelText('New password'), 'Brand-New-Pass1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Brand-New-Pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');

    const cur = screen.getByLabelText('Current password');
    await userEvent.clear(cur);
    await userEvent.type(cur, 'right-old-1'); // new + confirm are still filled in from the first try
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Password updated');
    expect(JSON.parse(fetchMock.mock.calls.filter((c: any) => c[0].includes('/password')).pop()![1].body)).toEqual({ currentPassword: 'right-old-1', newPassword: 'Brand-New-Pass1' });
  });
});

describe('ForcedPasswordChange', () => {
  it('explains the situation and refreshes the page once the password is changed', async () => {
    mockFetch({ '/api/auth/password': () => ({ json: { message: 'Password updated.' } }) });
    render(<ForcedPasswordChange name="Demo Salon" />);
    expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument();
    expect(screen.getByText(/Welcome to Demo Salon/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Current password'), 'K7QM-X2PD-9WTA');
    await userEvent.type(screen.getByLabelText('New password'), 'My-Own-Pass-77');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'My-Own-Pass-77');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
