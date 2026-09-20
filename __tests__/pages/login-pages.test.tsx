// __tests__/pages/login-pages.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../helpers/fetchMock';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => ({ tenantSlug: 'demo' }),
}));

import TenantLoginPage from '@/app/t/[tenantSlug]/login/page';
import PlatformLoginPage from '@/app/login/page';
import AdminLoginPage from '@/app/admin/login/page';

const originalFetch = global.fetch;

async function signIn(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('Salon sign-in page (everyone signs in here the same way)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    router.push.mockClear();
    router.refresh.mockClear();
    window.history.pushState({}, '', '/');
  });

  it('is ONE email + password form: no setup-code mode, no separate staff screen', () => {
    render(<TenantLoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText(/setup code/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create an account/ })).toBeInTheDocument();
  });

  it('staff: posts WITH the tenantSlug, then goes wherever the server says (their dashboard)', async () => {
    const fetchMock = mockFetch({
      '/api/auth/login': () => ({ json: { message: 'Signed in', staff: { role: 'admin', tenantSlug: 'demo', mustChangePassword: false }, customer: null, redirect: '/t/demo/dashboard' } }),
    });
    render(<TenantLoginPage />);
    await signIn('admin@demo.test', 'pw-12345');

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/t/demo/dashboard'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'admin@demo.test', password: 'pw-12345', tenantSlug: 'demo' });
  });

  it('customer: goes back to ?next= when it is a same-site path', async () => {
    window.history.pushState({}, '', '/t/demo/login?next=/t/demo/appointments');
    mockFetch({ '/api/auth/login': () => ({ json: { message: 'Signed in', staff: null, customer: { name: 'Jamie' }, redirect: '/t/demo' } }) });
    render(<TenantLoginPage />);
    await signIn('jamie@example.test', 'pw-12345');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/t/demo/appointments'));
  });

  it('ignores an off-site ?next= (no open redirect)', async () => {
    window.history.pushState({}, '', '/t/demo/login?next=//evil.example/steal');
    mockFetch({ '/api/auth/login': () => ({ json: { message: 'Signed in', staff: null, customer: { name: 'Jamie' }, redirect: '/t/demo' } }) });
    render(<TenantLoginPage />);
    await signIn('jamie@example.test', 'pw-12345');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/t/demo'));
  });

  it('a failed sign-in shows the error and does not navigate', async () => {
    mockFetch({ '/api/auth/login': () => ({ status: 401, json: { message: 'Invalid email or password' } }) });
    render(<TenantLoginPage />);
    await signIn('wrong@demo.test', 'bad-bad-bad');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('a person with access at several salons is asked which one, then signs in to that one', async () => {
    const fetchMock = mockFetch({
      '/api/auth/login': (url, init) => {
        const body = JSON.parse(String(init?.body));
        return body.tenantSlug === 'demo'
          ? { json: { message: 'Signed in', staff: { role: 'barber', tenantSlug: 'demo', mustChangePassword: false }, customer: null, redirect: '/t/demo/dashboard' } }
          : { json: { needsChoice: true, options: [{ tenantSlug: 'demo', tenantName: 'Demo Salon', role: 'barber' }, { tenantSlug: 'other', tenantName: 'Other Salon', role: 'receptionist' }] } };
      },
    });
    // On the Chair App (no salon in the address), so the server can't pick for them.
    render(<PlatformLoginPage />);
    await signIn('marcus@x.test', 'pw-12345');
    await userEvent.click(await screen.findByRole('button', { name: /Demo Salon \(Barber\)/ }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/t/demo/dashboard'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tenantSlug).toBe('demo');
  });
});

describe('The Chair App sign-in page', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    router.push.mockClear();
  });

  it('posts with no tenantSlug and sends customers home', async () => {
    const fetchMock = mockFetch({ '/api/auth/login': () => ({ json: { message: 'Signed in', staff: null, customer: { name: 'Jamie' }, redirect: '/' } }) });
    render(<PlatformLoginPage />);
    await signIn('jamie@example.test', 'pw-12345');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tenantSlug).toBeUndefined();
  });
});

describe('Admin (platform) login page', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    router.push.mockClear();
    router.refresh.mockClear();
  });

  it('posts to its OWN endpoint, /api/admin/login (the public sign-in refuses this account)', async () => {
    const fetchMock = mockFetch({ '/api/admin/login': () => ({ json: { message: 'Signed in' } }) });
    render(<AdminLoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'super@chairapp.test');
    await userEvent.type(screen.getByLabelText('Password'), 'pw123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/admin'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'super@chairapp.test', password: 'pw123' });
  });

  it('a failed login shows the error message', async () => {
    mockFetch({ '/api/admin/login': () => ({ status: 401, json: { message: 'Invalid email or password' } }) });
    render(<AdminLoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'wrong@chairapp.test');
    await userEvent.type(screen.getByLabelText('Password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
  });
});
