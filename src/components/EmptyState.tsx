/**
 * EmptyState.tsx
 * 
 * Reusable component for empty list screens.
 * Shows when there are no items to display.
 * 
 * Usage:
 * <EmptyState
 *   icon="📅"
 *   title="No upcoming appointments"
 *   description="Browse salons to book your first appointment."
 *   action={<Link href="/"><Button>Explore salons</Button></Link>}
 * />
 */

import React from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  /**
   * Icon emoji or React component
   * Default: 📭 (mailbox)
   */
  icon?: string | React.ReactNode;

  /**
   * Main heading text
   */
  title: string;

  /**
   * Optional descriptive text below title
   */
  description?: string;

  /**
   * Optional action (button, link, etc)
   */
  action?: React.ReactNode;

  /**
   * Optional custom illustration to replace icon
   */
  illustration?: React.ReactNode;

  /**
   * Optional className for container
   */
  className?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  illustration,
  className,
}: EmptyStateProps) {
  return (
    <div className={[styles.container, className].filter(Boolean).join(' ')}>
      {illustration ? (
        <div className={styles.illustrationWrapper}>{illustration}</div>
      ) : typeof icon === 'string' ? (
        <div className={styles.icon}>{icon}</div>
      ) : (
        <div className={styles.iconComponent}>{icon}</div>
      )}

      <h2 className={styles.title}>{title}</h2>

      {description && <p className={styles.description}>{description}</p>}

      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/**
 * Common empty state variants
 */

export function EmptyAppointments() {
  return (
    <EmptyState
      icon="📅"
      title="No upcoming appointments"
      description="Browse salons and book your next appointment."
    />
  );
}

export function EmptySearchResults() {
  return (
    <EmptyState
      icon="🔍"
      title="No results found"
      description="Try adjusting your search terms or filters."
    />
  );
}

export function EmptyFavorites() {
  return (
    <EmptyState
      icon="❤️"
      title="No saved salons yet"
      description="Save salons to quickly access them later."
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      icon="🔔"
      title="No notifications"
      description="You're all caught up!"
    />
  );
}

export function EmptyReviews() {
  return (
    <EmptyState
      icon="⭐"
      title="No reviews yet"
      description="This barber doesn't have any reviews. Be the first!"
    />
  );
}
