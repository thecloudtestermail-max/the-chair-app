// src/app/account/page.tsx
//
// A customer's account when they are on The Chair App itself (rather than
// inside one salon's pages).
'use client';

import Link from 'next/link';
import { AccountPanel } from '@/components/auth/AccountPanel';

export default function AccountPage() {
  return (
    <>
      <p style={{ maxWidth: 520, margin: '0 auto', padding: 'var(--space-4) var(--space-4) 0' }}>
        <Link href="/">&larr; The Chair App</Link>
      </p>
      <AccountPanel kind="customer" />
    </>
  );
}
