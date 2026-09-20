// src/app/admin/(protected)/layout.tsx
//
// Server-side gate for the platform-admin surface. Route-group parentheses
// keep this out of the URL, so /admin/login (outside this group) stays
// reachable without a session while everything else under /admin requires
// a super_admin session, checked here before any child renders.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySessionToken } from '@/lib/auth';
import { getDatabase } from '@/lib/mongodb';
import { AdminShell } from '@/components/admin/AdminShell';
import { ToastProvider } from '@/components/ui/Toast';

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;
  const session = await verifySessionToken(token);

  if (!session || session.role !== 'super_admin') {
    redirect('/admin/login');
  }

  const db = await getDatabase();
  const admin = await db.collection('users').findOne({ _id: session.subjectId }, { projection: { email: 1, username: 1 } });

  return (
    <ToastProvider>
      <AdminShell adminName={admin?.username || admin?.email || 'Platform admin'}>{children}</AdminShell>
    </ToastProvider>
  );
}
