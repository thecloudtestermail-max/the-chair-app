// src/app/robots.ts
//
// Let search engines index the public surfaces (discovery, salon pages,
// booking) and keep private ones out: the platform admin, all APIs, and
// each salon's staff dashboard and login.
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/t/*/dashboard', '/t/*/login'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
