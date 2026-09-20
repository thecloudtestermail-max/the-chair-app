// src/app/t/[tenantSlug]/account/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { AccountPanel } from '@/components/auth/AccountPanel';

export default function CustomerAccountPage() {
  const params = useParams<{ tenantSlug: string }>();
  return <AccountPanel kind="customer" tenantSlug={params.tenantSlug} />;
}
