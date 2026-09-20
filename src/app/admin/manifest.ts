// src/app/admin/manifest.ts
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` + `scope` make this an unambiguous, distinct install from the
    // discovery site it shares an origin with — see the tenant manifest
    // (src/app/t/[tenantSlug]/manifest.ts) for why both fields matter, and
    // src/lib/pwaScope.ts for the matching service-worker scope.
    id: '/admin',
    scope: '/admin/',
    name: 'The Chair App - Admin',
    short_name: 'Admin',
    description: 'Manage your salons and barbers',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#edefe7',
    theme_color: '#1f3b2e',
    icons: [
      { src: '/admin-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/admin-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
