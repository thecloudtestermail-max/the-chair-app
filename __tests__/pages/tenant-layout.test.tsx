// __tests__/pages/tenant-layout.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockFetch } from '../helpers/fetchMock';

const mocks = vi.hoisted(() => ({ pathname: '/t/demo' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ tenantSlug: 'demo' }),
  usePathname: () => mocks.pathname,
}));

import TenantLayout from '@/app/t/[tenantSlug]/layout';

const originalFetch = global.fetch;
const originalLocation = window.location;

describe('TenantLayout', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    mocks.pathname = '/t/demo';
  });

  it('renders children bare (no header/footer chrome) under /dashboard — DashboardShell provides its own', () => {
    mocks.pathname = '/t/demo/dashboard/settings';
    render(
      <TenantLayout>
        <p>Dashboard child</p>
      </TenantLayout>
    );
    expect(screen.getByText('Dashboard child')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('no longer renders its own footer landmark — the global SiteFooter owns it and the discovery link', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ status: 401, json: {} }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon', branding: {} }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Page content</p>
      </TenantLayout>
    );
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(screen.queryByText(/Powered by The Chair App/i)).not.toBeInTheDocument();
  });

  it('shows the tenant name once loaded, and a Book + My appointments nav', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ status: 401, json: {} }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon', branding: {} }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Page content</p>
      </TenantLayout>
    );
    await waitFor(() => expect(screen.getByText('Demo Salon')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Book/ })).toHaveAttribute('href', '/t/demo/book');
    expect(screen.getByRole('link', { name: 'My appointments' })).toHaveAttribute('href', '/t/demo/appointments');
  });

  it('shows a single \"Sign in\" button for a signed-out visitor, and no separate staff link', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ status: 401, json: {} }),
      '/api/customer-auth/me': () => ({ status: 401, json: {} }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon' }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Content</p>
      </TenantLayout>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Staff sign in' })).not.toBeInTheDocument();
  });

  it('shows Dashboard + \"Log out\" for a staff session, and the Dashboard link goes to THEIR salon', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ json: { role: 'admin', subjectType: 'user', tenantSlug: 'demo' } }),
      '/api/customer-auth/me': () => ({ status: 401, json: {} }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon' }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Content</p>
      </TenantLayout>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/t/demo/dashboard');
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('a signed-in CUSTOMER sees their name, an Account link and Sign out (and no Dashboard link)', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ status: 401, json: {} }),
      '/api/customer-auth/me': () => ({ json: { customerId: 'c1', name: 'Jamie Rivera', email: 'j@x.test' } }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon' }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Content</p>
      </TenantLayout>
    );
    await waitFor(() => expect(screen.getByText('Hi, Jamie')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/t/demo/account');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('a signed-out visitor can open the sign-in dialog, which offers Create account and Forgot password', async () => {
    mockFetch({
      '/api/auth/verify': () => ({ status: 401, json: {} }),
      '/api/customer-auth/me': () => ({ status: 401, json: {} }),
      '/api/public/tenants/demo': () => ({ json: { tenant: { name: 'Demo Salon' }, settings: {} } }),
    });
    render(
      <TenantLayout>
        <p>Content</p>
      </TenantLayout>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create an account/ })).toBeInTheDocument();
  });
});
