// __tests__/site.test.ts
import { describe, it, expect } from 'vitest';
import { SITE_URL, SITE_HOST, discoveryUrl } from '@/lib/site';

describe('site config', () => {
  it('defaults to the production discovery address, without a trailing slash', () => {
    expect(SITE_URL).toBe('https://the-chair-app.vercel.app');
    expect(SITE_HOST).toBe('the-chair-app.vercel.app');
  });

  it('discoveryUrl() is the clean address when there is no salon', () => {
    expect(discoveryUrl()).toBe(SITE_URL);
  });

  it('discoveryUrl(slug) tags the salon and encodes it safely', () => {
    const url = new URL(discoveryUrl('a b&c'));
    expect(url.searchParams.get('utm_campaign')).toBe('a b&c');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
  });
});
