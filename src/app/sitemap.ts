// src/app/sitemap.ts
//
// Lists the discovery home plus each ACTIVE salon's public page and booking
// page, so a new salon becomes findable without anyone submitting it
// anywhere. Suspended salons are excluded (their pages 404 anyway).
// force-dynamic: it reads the database, which must not happen at build time.
import type { MetadataRoute } from 'next';
import { getDatabase } from '@/lib/mongodb';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: 'daily', priority: 1 }];

  try {
    const db = await getDatabase();
    const tenants = await db
      .collection('tenants')
      .find({ status: 'active' }, { projection: { slug: 1 } })
      .toArray();

    for (const t of tenants) {
      entries.push({ url: `${SITE_URL}/t/${t.slug}`, changeFrequency: 'weekly', priority: 0.8 });
      entries.push({ url: `${SITE_URL}/t/${t.slug}/book`, changeFrequency: 'weekly', priority: 0.6 });
    }
  } catch (error) {
    // Never fail the whole sitemap because the DB hiccuped: serve the root entry.
    console.error('[sitemap] could not list tenants:', error);
  }

  return entries;
}
