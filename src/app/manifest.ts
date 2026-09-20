// src/app/manifest.ts
//
// Discovery (root) surface manifest — static, no DB call needed. Per-segment
// manifests replace the old single header-driven manifest.ts (which never
// worked — see admin/manifest.ts and t/[tenantSlug]/manifest.ts).
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'The Chair App - Discover Salons',
    short_name: 'The Chair App',
    description: 'Discover and book appointments at top salons and barbershops',
    start_url: '/',
    display: 'standalone',
    background_color: '#edefe7',
    theme_color: '#1f3b2e',
    icons: [
      { src: '/logo-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
