// __tests__/components/CustomerSignInModal.test.tsx
//
// The sign-in pop-up is now a frame around the shared SignInForm: email +
// password for everyone, with Create account and Forgot password inside it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerSignInModal } from '@/components/CustomerSignInModal';
import { renderWithToast } from '../helpers/testProviders';
import { mockFetch } from '../helpers/fetchMock';

const originalFetch = global.fetch;
const originalLocation = window.location;

function stubLocation() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', { value: { ...originalLocation, assign, pathname: '/t/demo', search: '' }, writable: true, configurable: true });
  return assign;
}

describe('CustomerSignInModal', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  });

  it('renders nothing when closed', () => {
    renderWithToast(<CustomerSignInModal open={false} onClose={() => {}} onSignedIn={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on email + password, with Forgot password and Create account within reach', () => {
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create an account/ })).toBeInTheDocument();
  });

  it('no longer mentions one-time codes or booking first to get an account', () => {
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={() => {}} />);
    expect(screen.queryByText(/one-time code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Book an appointment first/i)).not.toBeInTheDocument();
  });

  it('signs a customer in with email + password (with the salon from the address bar) and calls onSignedIn', async () => {
    stubLocation();
    const onSignedIn = vi.fn();
    const fetchMock = mockFetch({
      '/api/auth/login': () => ({ json: { message: 'Signed in', staff: null, customer: { name: 'Jamie Rivera' }, redirect: '/t/demo' } }),
    });
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'jamie@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Correct-Pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'jamie@example.test', password: 'Correct-Pass-1', tenantSlug: 'demo' });
  });

  it('a wrong password shows the server message and does not sign in', async () => {
    const onSignedIn = vi.fn();
    mockFetch({ '/api/auth/login': () => ({ status: 401, json: { message: 'Invalid email or password' } }) });
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'jamie@example.test');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('Create account switches the dialog to registration and posts every detail', async () => {
    stubLocation();
    const onSignedIn = vi.fn();
    const fetchMock = mockFetch({
      '/api/auth/register': () => ({ status: 201, json: { message: 'Account created', customer: { name: 'New Person' }, redirect: '/t/demo' } }),
    });
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={onSignedIn} />);
    await userEvent.click(screen.getByRole('button', { name: /Create an account/ }));
    expect(screen.getByRole('dialog', { name: 'Create your account' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Full name'), 'New Person');
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.test');
    await userEvent.type(screen.getByLabelText('Phone number'), '555 010 0100');
    await userEvent.type(screen.getByLabelText('Password'), 'Brand-New-Pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      name: 'New Person', email: 'new@example.test', phone: '555 010 0100', password: 'Brand-New-Pass1', tenantSlug: 'demo',
    });
  });

  it('team members who sign in from a public page are sent to their dashboard', async () => {
    const assign = stubLocation();
    const onSignedIn = vi.fn();
    mockFetch({
      '/api/auth/login': () => ({ json: { message: 'Signed in', staff: { role: 'barber', tenantSlug: 'demo', mustChangePassword: true }, customer: null, redirect: '/t/demo/dashboard' } }),
    });
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText('Email'), 'marcus@demo.test');
    await userEvent.type(screen.getByLabelText('Password'), 'K7QM-X2PD-9WTA');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/t/demo/dashboard'));
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('Forgot password with no email provider tells the person to email support', async () => {
    mockFetch({
      '/api/auth/forgot': () => ({ json: { delivery: 'manual', supportEmail: 'geehyness22@gmail.com', message: "Password reset by email isn't set up yet. Please email geehyness22@gmail.com from the address on your account and we'll reset your password for you." } }),
    });
    renderWithToast(<CustomerSignInModal open onClose={() => {}} onSignedIn={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('dialog', { name: 'Reset your password' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'jamie@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent('geehyness22@gmail.com');
    expect(screen.getByRole('link', { name: /geehyness22@gmail.com/ })).toHaveAttribute('href', expect.stringContaining('mailto:geehyness22@gmail.com'));
  });
});
