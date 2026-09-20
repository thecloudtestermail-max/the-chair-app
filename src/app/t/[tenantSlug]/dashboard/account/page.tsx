// src/app/t/[tenantSlug]/dashboard/account/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { AccountPanel } from '@/components/auth/AccountPanel';

export default function StaffAccountPage() {
  const params = useParams<{ tenantSlug: string }>();
  return <AccountPanel kind="staff" tenantSlug={params.tenantSlug} />;
}
