// src/app/admin/layout.tsx
//
// Wraps EVERYTHING under /admin — both /admin/login (outside the auth gate)
// and the (protected) group's own layout — so it's the one place that can
// carry section-wide metadata. Deliberately carries NO auth logic: an
// earlier version of this file redirected unauthenticated visitors to
// /admin/login from here, which — since this layout also wraps
// /admin/login itself — infinite-loops. The session check belongs only in
// (protected)/layout.tsx, one level down, which /admin/login sits outside of.
//
// Bug fix: admin/manifest.ts produces a route at /admin/manifest.webmanifest,
// but nothing linked to it — Next.js only auto-injects <link rel="manifest">
// for the ROOT app/manifest.ts. A nested one needs its own `metadata.manifest`,
// set here, or the section is never actually installable no matter how
// correct the manifest file itself is.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Chair App — Admin',
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chair Admin',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
