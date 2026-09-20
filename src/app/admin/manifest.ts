// src/app/admin/manifest.ts
import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
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
