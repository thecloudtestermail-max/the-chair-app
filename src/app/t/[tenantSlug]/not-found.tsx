'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NotFoundPage } from '@/components/ErrorPage';

export default function TenantNotFound() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  return (
    <>
      <p style={{ padding: 'var(--space-4)', margin: 0 }}>
        <Link href={`/t/${tenantSlug}`}>← Back to salon</Link>
      </p>
      <NotFoundPage />
    </>
  );
}
