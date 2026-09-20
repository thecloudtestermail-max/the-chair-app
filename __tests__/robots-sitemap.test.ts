// __tests__/robots-sitemap.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import { FakeDb } from './helpers/fakeMongo';

const fakeDb = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/mongodb', () => ({
  getDatabase: async () => fakeDb.db,
  connectToDatabase: async () => ({ db: fakeDb.db, client: {} }),
}));

describe('robots', () => {
  it('hides admin, APIs, dashboards and staff login; points at the sitemap', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/admin', '/api/', '/t/*/dashboard', '/t/*/login']));
    expect(r.sitemap).toBe('https://the-chair-app.vercel.app/sitemap.xml');
  });
});

describe('sitemap', () => {
  beforeEach(() => {
    fakeDb.db = new FakeDb();
  });

  it('lists the home page plus public + booking pages for active salons only', async () => {
    const db = fakeDb.db as FakeDb;
    db.collection('tenants').seed([
      { _id: new ObjectId(), slug: 'quano-locs', status: 'active' },
      { _id: new ObjectId(), slug: 'closed-shop', status: 'suspended' },
    ]);
    const sitemap = (await import('@/app/sitemap')).default;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://the-chair-app.vercel.app');
    expect(urls).toContain('https://the-chair-app.vercel.app/t/quano-locs');
    expect(urls).toContain('https://the-chair-app.vercel.app/t/quano-locs/book');
    expect(urls.some((u) => u.includes('closed-shop'))).toBe(false);
    expect(urls.some((u) => u.includes('/dashboard') || u.includes('/login') || u.includes('/admin'))).toBe(false);
  });

  it('still serves the home entry if the database fails', async () => {
    fakeDb.db = { collection: () => { throw new Error('db down'); } };
    const sitemap = (await import('@/app/sitemap')).default;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(['https://the-chair-app.vercel.app']);
  });
});
