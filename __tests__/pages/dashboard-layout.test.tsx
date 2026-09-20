// __tests__/pages/dashboard-layout.test.tsx
//
// DashboardLayout is an async Next.js server component (reads cookies(),
// calls redirect()). Tested by calling it directly as a function and
// awaiting the JSX it returns — the standard way to unit-test an App
// Router server component outside a running Next server.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ObjectId } from 'mongodb';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  session: null as any,
  tenant: null as any,
  siteSettings: null as any,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'session' && mocks.cookieValue ? { value: mocks.cookieValue } : undefined) }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  usePathname: () => '/t/demo/dashboard',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

vi.mock('@/lib/auth', () => ({
  verifySessionToken: async () => mocks.session,
}));

vi.mock('@/lib/resolveTenantBySlug', () => ({
  resolveTenantBySlug: async () => mocks.tenant,
}));

vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => ({
    collection: () => ({ findOne: async () => mocks.siteSettings }),
  }),
}));

import DashboardLayout from '@/app/t/[tenantSlug]/dashboard/layout';

describe('DashboardLayout', () => {
  beforeEach(() => {
    mocks.cookieValue = undefined;
    mocks.session = null;
    mocks.tenant = null;
    mocks.siteSettings = null;
  });

  it('redirects to tenant login when the tenant slug does not resolve', async () => {
    mocks.tenant = null;
    await expect(
      DashboardLayout({ children: <div />, params: Promise.resolve({ tenantSlug: 'nope' }) })
    ).rejects.toThrow('REDIRECT:/t/nope/login');
  });

  it('redirects to login with no session cookie at all', async () => {
    mocks.tenant = { _id: new ObjectId(), name: 'Demo' };
    mocks.session = null;
    await expect(
      DashboardLayout({ children: <div />, params: Promise.resolve({ tenantSlug: 'demo' }) })
    ).rejects.toThrow('REDIRECT:/t/demo/login');
  });

  it('redirects when the session role is not a staff role (e.g. super_admin browsing here)', async () => {
    const tenantId = new ObjectId();
    mocks.tenant = { _id: tenantId, name: 'Demo' };
    mocks.session = { role: 'super_admin', tenantId };
    await expect(
      DashboardLayout({ children: <div />, params: Promise.resolve({ tenantSlug: 'demo' }) })
    ).rejects.toThrow('REDIRECT:/t/demo/login');
  });

  it('redirects when the session belongs to a DIFFERENT tenant than the URL (cross-tenant guard)', async () => {
    const tenantId = new ObjectId();
    const otherTenantId = new ObjectId();
    mocks.tenant = { _id: tenantId, name: 'Demo' };
    mocks.session = { role: 'admin', tenantId: otherTenantId };
    await expect(
      DashboardLayout({ children: <div />, params: Promise.resolve({ tenantSlug: 'demo' }) })
    ).rejects.toThrow('REDIRECT:/t/demo/login');
  });

  it('renders DashboardShell with the tenant name and role for a valid same-tenant staff session', async () => {
    const tenantId = new ObjectId();
    mocks.tenant = { _id: tenantId, name: 'Demo Salon' };
    mocks.session = { role: 'admin', tenantId };
    mocks.siteSettings = { title: 'Demo Salon (Custom Title)' };

    const jsx = await DashboardLayout({ children: <p>Child content</p>, params: Promise.resolve({ tenantSlug: 'demo' }) });
    render(jsx);
    expect(screen.getByText('Demo Salon (Custom Title)')).toBeInTheDocument(); // prefers siteSettings.title
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('falls back to the tenant\'s own name when siteSettings has no title yet', async () => {
    const tenantId = new ObjectId();
    mocks.tenant = { _id: tenantId, name: 'Demo Salon' };
    mocks.session = { role: 'admin', tenantId };
    mocks.siteSettings = null;

    const jsx = await DashboardLayout({ children: <p>Child</p>, params: Promise.resolve({ tenantSlug: 'demo' }) });
    render(jsx);
    expect(screen.getByText('Demo Salon')).toBeInTheDocument();
  });

  it('while the session is still on a temporary password, shows ONLY the change-password screen (no dashboard chrome or children)', async () => {
    const tenantId = new ObjectId();
    mocks.tenant = { _id: tenantId, name: 'Demo Salon' };
    mocks.session = { role: 'barber', tenantId, mustChangePassword: true };

    const jsx = await DashboardLayout({ children: <p>Secret dashboard content</p>, params: Promise.resolve({ tenantSlug: 'demo' }) });
    render(jsx);
    expect(screen.getByRole('heading', { name: 'Choose your own password' })).toBeInTheDocument();
    expect(screen.queryByText('Secret dashboard content')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Dashboard navigation' })).not.toBeInTheDocument();
  });
});
