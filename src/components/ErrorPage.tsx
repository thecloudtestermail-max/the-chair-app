/**
 * Phase 6: Error Pages and Empty States
 * 
 * Global error handling with proper navigation context
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { BackLink } from '@/components/BackLink';
import styles from './error-page.module.css';

interface ErrorPageProps {
  status: number;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function ErrorPage({ status, title, description, action }: ErrorPageProps) {
  const pathname = usePathname();
  const isInSalon = pathname.includes('/t/');
  const isSalonConsole = pathname.includes('/dashboard');

  // Compute sensible fallback links
  const salonMatch = pathname.match(/\/t\/([^/]+)/);
  const salonSlug = salonMatch?.[1];

  let fallbackHref = '/';
  if (salonSlug && isInSalon) {
    fallbackHref = isSalonConsole ? `/t/${salonSlug}/dashboard` : `/t/${salonSlug}`;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.statusCode}>{status}</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>

        <div className={styles.actions}>
          {action ? (
            action
          ) : (
            <>
              <BackLink hideIfNoParent className={styles.button} />
              <Link href={fallbackHref} className={styles.button}>
                <Button>Go home</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <ErrorPage
      status={404}
      title="Page not found"
      description="This page doesn't exist or has been moved. Check the address and try again."
    />
  );
}

export function ServerErrorPage() {
  return (
    <ErrorPage
      status={500}
      title="Something went wrong"
      description="We encountered an error. Please try again or contact support if the problem persists."
    />
  );
}

export function UnauthorizedPage() {
  return (
    <ErrorPage
      status={401}
      title="Sign in required"
      description="You need to sign in to access this page."
      action={<Link href="/login"><Button>Sign in</Button></Link>}
    />
  );
}

export function ForbiddenPage() {
  return (
    <ErrorPage
      status={403}
      title="Access denied"
      description="You don't have permission to access this page."
    />
  );
}
