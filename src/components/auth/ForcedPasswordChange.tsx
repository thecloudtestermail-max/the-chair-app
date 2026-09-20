// src/components/auth/ForcedPasswordChange.tsx
//
// Shown INSTEAD of the dashboard while a team member is still on the
// temporary password from their welcome PDF. Nothing else in the dashboard
// works until this is done (the API refuses their session too), so there is
// no way to carry on with a password that was printed on paper.
'use client';

import { useRouter } from 'next/navigation';
import { Ticket } from '@/components/ui/Ticket';
import { ChangePasswordForm } from './ChangePasswordForm';
import styles from './AccountPanel.module.css';

export function ForcedPasswordChange({ name }: { name: string }) {
  const router = useRouter();
  return (
    <div className={styles.forced}>
      <Ticket>
        <h1 className={styles.title}>Choose your own password</h1>
        <p className={styles.muted}>
          Welcome to {name}. The password in your welcome guide was only to get you in. Enter it below as your current password, then choose one only you know.
        </p>
        <ChangePasswordForm onChanged={() => router.refresh()} />
      </Ticket>
    </div>
  );
}
