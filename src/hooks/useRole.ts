// src/hooks/useRole.ts
//
// The dashboard layout (dashboard/layout.tsx) already verifies the staff
// session server-side and knows the caller's role before any child page
// renders. DashboardShell receives that role as a prop but never exposed
// it past itself, so admin-only pages (settings, barbers, services,
// analytics) had no way to tell "still loading" apart from "loaded and
// got a 401" — a non-admin deep-linking to one of them saw an infinite
// skeleton instead of an access-denied message. This context threads the
// already-verified role down so any page can gate on it directly, without
// waiting on a fetch to fail first.
'use client';
import { createContext, useContext } from 'react';

export type StaffRole = 'admin' | 'receptionist' | 'barber';

const RoleContext = createContext<StaffRole | null>(null);

export const RoleProvider = RoleContext.Provider;

export function useRole(): StaffRole {
  const role = useContext(RoleContext);
  if (!role) {
    throw new Error('useRole() must be used within a RoleProvider (i.e. inside DashboardShell)');
  }
  return role;
}

/** Like useRole(), but null instead of throwing outside a RoleProvider, for shared UI that only adapts when a role is known. */
export function useOptionalRole(): StaffRole | null {
  return useContext(RoleContext);
}
