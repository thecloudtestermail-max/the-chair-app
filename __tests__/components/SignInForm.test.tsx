// __tests__/components/SignInForm.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm, destinationAfterSignIn } from '@/components/auth/SignInForm';
import { mockFetch } from '../helpers/fetchMock';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('destinationAfterSignIn', () => {
  const staff = { redirect: '/t/demo/dashboard', staff: { role: 'admin', tenantSlug: 'demo', mustChangePassword: false }, customer: null };
  const customer = { redirect: '/t/demo', staff: null, customer: { name: 'Jamie' } };

  it('staff go to their dashboard even if they were heading elsewhere', () => {
    expect(destinationAfterSignIn(staff, '/t/demo/appointments')).toBe('/t/demo/dashboard');
  });
  it('...unless the destination is already inside their dashboard', () => {
    expect(destinationAfterSignIn(staff, '/t/demo/dashboard/staff')).toBe('/t/demo/dashboard/staff');
  });
  it('customers go back to where they were, else the server suggestion', () => {
    expect(destinationAfterSignIn(customer, '/t/demo/book')).toBe('/t/demo/book');
    expect(destinationAfterSignIn(customer, null)).toBe('/t/demo');
  });
  it('a person who is both, signing in at another salon, stays in the customer view', () => {
    expect(destinationAfterSignIn({ redirect: '/t/other', staff: staff.staff, customer: { name: 'J' } }, null)).toBe('/t/other');
  });
});

describe('SignInForm', () => {
  it('registration: an email that already exists points to "Set or reset my password"', async () => {
    mockFetch({ '/api/auth/register': () => ({ status: 409, json: { message: 'An account with this email already exists.', code: 'exists' } }) });
    render(<SignInForm tenantSlug="demo" initialMode="register" onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText('Full name'), 'Guest Booker');
    await userEvent.type(screen.getByLabelText('Email'), 'guest@example.test');
    await userEvent.type(screen.getByLabelText('Phone number'), '555 010 0100');
    await userEvent.type(screen.getByLabelText('Password'), 'Good-Pass-123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    await userEvent.click(screen.getByRole('button', { name: 'Set or reset my password' }));
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });

  it('forgot password with email configured shows the "check your inbox" message, not the support address', async () => {
    mockFetch({ '/api/auth/forgot': () => ({ json: { delivery: 'email', message: "If an account exists for that email, we've sent a link to reset your password." } }) });
    render(<SignInForm tenantSlug="demo" initialMode="forgot" onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText('Email'), 'jamie@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('status')).toHaveTextContent("we've sent a link");
    expect(screen.queryByRole('link', { name: /Email / })).not.toBeInTheDocument();
  });

  it('a network failure shows a friendly error instead of hanging', async () => {
    global.fetch = vi.fn(async () => { throw new Error('offline'); }) as any;
    render(<SignInForm tenantSlug="demo" onSignedIn={() => {}} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.test');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/connection/i));
  });

  it('passwords get the built-in show/hide toggle', () => {
    render(<SignInForm tenantSlug="demo" onSignedIn={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });
});
