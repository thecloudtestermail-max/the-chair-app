// __tests__/components/SiteFooter.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

import { SiteFooter } from '@/components/SiteFooter';

describe('SiteFooter', () => {
  afterEach(() => {
    mocks.pathname = '/';
  });

  it('is a single contentinfo landmark', () => {
    render(<SiteFooter />);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });

  it('links to the platform address, showing the host as its text', () => {
    render(<SiteFooter />);
    const link = screen.getByRole('link', { name: /the-chair-app\.vercel\.app/i });
    expect(link).toHaveAttribute('href', 'https://the-chair-app.vercel.app');
  });

  it('on platform pages it is a plain same-tab link with no tracking tags', () => {
    mocks.pathname = '/admin';
    render(<SiteFooter />);
    const link = screen.getByRole('link', { name: /the-chair-app\.vercel\.app/i });
    expect(link).not.toHaveAttribute('target');
    expect(link.getAttribute('href')).not.toContain('utm_');
  });

  it('inside a salon it opens in a new tab and names the salon in its UTM tags', () => {
    mocks.pathname = '/t/quano-locs/book';
    render(<SiteFooter />);
    const link = screen.getByRole('link', { name: /the-chair-app\.vercel\.app/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const url = new URL(link.getAttribute('href')!);
    expect(url.origin).toBe('https://the-chair-app.vercel.app');
    expect(url.searchParams.get('utm_source')).toBe('tenant_footer');
    expect(url.searchParams.get('utm_campaign')).toBe('quano-locs');
  });

  it('warns assistive tech that the salon-page link opens a new tab', () => {
    mocks.pathname = '/t/quano-locs';
    render(<SiteFooter />);
    expect(screen.getByText(/opens in a new tab/i)).toBeInTheDocument();
  });

  it('also appears on staff dashboard pages', () => {
    mocks.pathname = '/t/quano-locs/dashboard/settings';
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
