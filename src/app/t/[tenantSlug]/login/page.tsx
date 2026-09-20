// src/app/t/[tenantSlug]/login/page.tsx
//
// The salon's sign-in page. Everyone signs in here the same way, with email +
// password: customers, receptionists, barbers and owners. Customers can also
// create an account or reset their password from this page. The old separate
// "Have a setup code?" screen for invited staff no longer exists: staff get a
// temporary password in their welcome PDF and sign in like anyone else.
'use client';

import { useParams } from 'next/navigation';
import { AuthPage } from '@/components/auth/AuthPage';

export default function TenantLoginPage() {
  const params = useParams<{ tenantSlug: string }>();
  return <AuthPage tenantSlug={params.tenantSlug} eyebrow="Welcome back" />;
}
