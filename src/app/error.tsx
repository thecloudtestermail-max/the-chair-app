'use client';

import { ServerErrorPage } from '@/components/ErrorPage';
import { Button } from '@/components/ui/Button';
import styles from '@/components/error-page.module.css';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <ServerErrorPage />
        <button 
          onClick={reset}
          style={{ 
            marginTop: 'var(--space-4)',
            padding: 'var(--space-3) var(--space-5)',
            border: 'none',
            borderRadius: 'var(--radius-control)',
            background: 'var(--brass)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
