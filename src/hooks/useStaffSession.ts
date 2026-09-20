// src/hooks/useStaffSession.ts
//
// Whether the visitor is signed in as staff (and where their dashboard is),
// so public pages can offer a "Dashboard" link instead of pretending the
// visitor is a stranger. undefined = still checking, null = not staff.
'use client';
import { useEffect, useState } from 'react';

export interface StaffSession {
  role: string;
  tenantSlug?: string;
  mustChangePassword?: boolean;
}

export function useStaffSession() {
  const [staff, setStaff] = useState<StaffSession | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/verify')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setStaff(data && data.subjectType !== 'customer' ? data : null); })
      .catch(() => { if (!cancelled) setStaff(null); });
    return () => { cancelled = true; };
  }, []);

  return { staff, clearStaff: () => setStaff(null) };
}

/** Where a staff session's dashboard lives, or null for the platform admin (who has no salon). */
export function dashboardHref(staff: StaffSession | null | undefined): string | null {
  if (!staff) return null;
  if (staff.role === 'super_admin') return '/admin';
  return staff.tenantSlug ? `/t/${staff.tenantSlug}/dashboard` : null;
}
