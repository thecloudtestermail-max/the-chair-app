// src/app/t/[tenantSlug]/dashboard/layout.tsx
//
// This whole directory did not exist before Part 2 — Part 1's audit found
// that every staff CRUD API was built and correctly tenant-scoped, but
// there was zero UI calling any of it. This layout is the server-side gate
// for that new surface: same pattern as admin/(protected)/layout.tsx
// (session checked here, before any child renders), extended to also
// confirm the session's tenantId matches the URL's tenantSlug — a staff
// member logged into salon A must not be able to browse to
// /t/salon-b/dashboard and see salon A's session honored there.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import { resolveTenantBySlug } from '@/lib/resolveTenantBySlug';
import { getDatabase } from '@/lib/mongodb';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { ToastProvider } from '@/components/ui/Toast';
import { ForcedPasswordChange } from '@/components/auth/ForcedPasswordChange';

const STAFF_ROLES = ['admin', 'receptionist', 'barber'] as const;

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  const session = await verifySessionToken(token);

  const tenant = await resolveTenantBySlug(tenantSlug);
  if (!tenant) {
    redirect(`/t/${tenantSlug}/login`);
  }

  if (
    !session ||
    !(STAFF_ROLES as readonly string[]).includes(session.role) ||
    !session.tenantId ||
    session.tenantId.toString() !== tenant._id!.toString()
  ) {
    redirect(`/t/${tenantSlug}/login`);
  }

  const db = await getDatabase();
  const settings = await db.collection('siteSettings').findOne({ tenantId: tenant._id }, { projection: { title: 1 } });

  // Still on the temporary password from the welcome PDF: show only the
  // change-password form. (The API refuses this session for everything else
  // too, see lib/requireRole.ts.)
  if (session.mustChangePassword) {
    return <ForcedPasswordChange name={settings?.title || tenant.name} />;
  }

  return (
    <ToastProvider>
      <DashboardShell tenantSlug={tenantSlug} tenantName={settings?.title || tenant.name} role={session.role as 'admin' | 'receptionist' | 'barber'}>
        {children}
      </DashboardShell>
    </ToastProvider>
  );
}
