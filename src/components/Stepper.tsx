/**
 * Stepper Component
 * 
 * Visual progress indicator for multi-step forms.
 * Shows completed, current, and pending steps.
 * 
 * Usage:
 * <Stepper 
 *   steps={['Service', 'Barber', 'Time', 'Details']}
 *   current={2}
 *   completed={1}
 * />
 */

import styles from './Stepper.module.css';

interface StepperProps {
  steps: string[];
  current: number; // 1-indexed
  completed?: number; // 0-indexed count of completed steps
  className?: string;
}

export function Stepper({ steps, current, completed = 0, className }: StepperProps) {
  return (
    <div className={[styles.stepper, className].filter(Boolean).join(' ')}>
      <div className={styles.track}>
        {steps.map((label, i) => {
          const isCompleted = i < completed;
          const isCurrent = i === current - 1;
          const isPending = i > current - 1;

          return (
            <div
              key={i}
              className={[
                styles.step,
                isCompleted && styles.completed,
                isCurrent && styles.current,
                isPending && styles.pending,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* Connector line to next step */}
              {i < steps.length - 1 && (
                <div
                  className={[
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              )}

              {/* Step bullet */}
              <div className={styles.bullet}>
                {isCompleted ? (
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>

              {/* Step label */}
              <span className={styles.label}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
