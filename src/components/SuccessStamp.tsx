/**
 * SuccessStamp.tsx
 * 
 * Animated stamp component for booking confirmations.
 * Shows when a booking is successfully created.
 * 
 * Usage:
 * <SuccessStamp visible={bookingConfirmed} />
 */

import { useEffect, useState } from 'react';
import styles from './SuccessStamp.module.css';

interface SuccessStampProps {
  visible?: boolean;
  label?: string;
  duration?: number; // ms before auto-hide
  onComplete?: () => void;
}

export function SuccessStamp({
  visible = true,
  label = 'BOOKED',
  duration,
  onComplete,
}: SuccessStampProps) {
  const [isVisible, setIsVisible] = useState(visible);

  useEffect(() => {
    setIsVisible(visible);

    if (visible && duration) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.stamp}>
        <div className={styles.circle}>
          <svg className={styles.checkmark} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className={styles.text}>{label}</span>
      </div>
    </div>
  );
}

/**
 * ConfirmationSequence.tsx
 * 
 * Multi-step confirmation animation:
 * 1. Loading spinner (brief)
 * 2. Success stamp
 * 3. Fade to confirmation content
 * 
 * Usage:
 * <ConfirmationSequence
 *   stage={confirmationStage}
 *   onComplete={() => setShowContent(true)}
 * />
 */

interface ConfirmationSequenceProps {
  stage: 'loading' | 'success' | 'done';
  onComplete?: () => void;
}

export function ConfirmationSequence({ stage, onComplete }: ConfirmationSequenceProps) {
  useEffect(() => {
    if (stage === 'done') {
      onComplete?.();
    }
  }, [stage, onComplete]);

  return (
    <div className={styles.sequenceContainer}>
      {stage === 'loading' && <LoadingSpinner />}
      {stage === 'success' && <SuccessStamp duration={1500} />}
    </div>
  );
}

/**
 * Spinner component for loading states
 */

function LoadingSpinner() {
  return (
    <div className={styles.spinner}>
      <div className={styles.spinnerRing} />
    </div>
  );
}

/**
 * Hook to manage confirmation sequence
 */

export function useConfirmationSequence() {
  const [stage, setStage] = useState<'idle' | 'loading' | 'success' | 'done'>('idle');

  const start = async (asyncFn: () => Promise<void>) => {
    setStage('loading');
    try {
      await asyncFn();
      setStage('success');
      // Transitions to 'done' after stamp duration
      setTimeout(() => setStage('done'), 1500);
    } catch (error) {
      setStage('idle');
      throw error;
    }
  };

  const reset = () => setStage('idle');

  return { stage, start, reset };
}
