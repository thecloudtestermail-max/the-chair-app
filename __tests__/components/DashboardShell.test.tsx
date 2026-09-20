// __tests__/components/DashboardShell.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRole } from '@/hooks/useRole';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/t/demo/dashboard',
  useRouter: () => router,
}));

import { DashboardShell } from '@/components/dashboard/DashboardShell';

const originalFetch = global.fetch;

function ChildReadingRole() {
  const role = useRole();
  return <p>Child sees role: {role}</p>;
}

describe('DashboardShell', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    router.push.mockClear();
    router.refresh.mockClear();
  });

  it('an admin sees every nav item, including admin-only ones', () => {
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="admin">
        <p>Content</p>
      </DashboardShell>
    );
    for (const label of ['Overview', 'Appointments', 'Waitlist', 'Services', 'Barbers', 'Customers', 'Reviews', 'Analytics', 'Settings']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('a receptionist does NOT see admin-only nav items (Services, Barbers, Reviews, Analytics, Settings)', () => {
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="receptionist">
        <p>Content</p>
      </DashboardShell>
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers' })).toBeInTheDocument();
    for (const label of ['Services', 'Barbers', 'Reviews', 'Analytics', 'Settings']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('a barber sees only Overview and Appointments', () => {
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="barber">
        <p>Content</p>
      </DashboardShell>
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appointments' })).toBeInTheDocument();
    for (const label of ['Waitlist', 'Services', 'Barbers', 'Customers', 'Reviews', 'Analytics', 'Settings']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('every role gets an Account item (change password lives there)', () => {
    for (const role of ['admin', 'receptionist', 'barber'] as const) {
      const { unmount } = render(<DashboardShell tenantSlug="demo" tenantName="Demo" role={role}><div /></DashboardShell>);
      expect(screen.getByRole('link', { name: /Account/ })).toHaveAttribute('href', '/t/demo/dashboard/account');
      unmount();
    }
  });

  it('displays the tenant name and the role in the sidebar brand', () => {
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="admin">
        <p>Content</p>
      </DashboardShell>
    );
    expect(screen.getByText('Demo Salon')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('logout calls the logout API, then navigates to the tenant login page', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="admin">
        <p>Content</p>
      </DashboardShell>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(router.push).toHaveBeenCalledWith('/t/demo/login');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('provides the role to descendant components via RoleProvider (useRole())', () => {
    render(
      <DashboardShell tenantSlug="demo" tenantName="Demo Salon" role="receptionist">
        <ChildReadingRole />
      </DashboardShell>
    );
    expect(screen.getByText('Child sees role: receptionist')).toBeInTheDocument();
  });
});
