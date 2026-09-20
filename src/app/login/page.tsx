// src/app/login/page.tsx
//
// Sign in to The Chair App itself (not through a particular salon). Same form
// as a salon's login page: staff are sent to their salon's dashboard, and
// customers back to the home page.
'use client';

import { AuthPage } from '@/components/auth/AuthPage';

export default function LoginPage() {
  return <AuthPage eyebrow="The Chair App" />;
}
