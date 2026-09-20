/**
 * BackLink.tsx
 *
 * Smart back link that never throws a user out of their current world.
 * Uses navigation history from useNavigation hook, or falls back to
 * navMap's declared parent relationships.
 */

'use client';

import Link from 'next/link';
import { useNavigation } from '@/hooks/useNavigation';

interface BackLinkProps {
  /** Override the computed back path with a hardcoded one. */
  href?: string;
  /** Override the computed label. */
  label?: string;
  /** CSS class to apply to the link. */
  className?: string;
  /** If true, don't render anything if no valid back path exists. */
  hideIfNoParent?: boolean;
}

/**
 * Render a back link that respects the user's navigation context.
 * Only renders if a valid back path exists within the current world.
 */
export function BackLink({
  href,
  label,
  className,
  hideIfNoParent,
}: BackLinkProps) {
  const nav = useNavigation();
  const backPath = href || nav.getBackPath();
  const backLabel = label || nav.getBackLabel();

  if (!backPath) {
    return hideIfNoParent ? null : <span className={className}>← Back</span>;
  }

  return (
    <Link href={backPath} className={className}>
      {backLabel}
    </Link>
  );
}

/**
 * Alternative: a simple button-style back link for modals or overlays.
 * Useful when you want a less prominent back affordance.
 */
export function BackButton({
  href,
  label = '← Back',
  className,
  onClick,
}: BackLinkProps & { onClick?: () => void }) {
  const nav = useNavigation();
  const backPath = href || nav.getBackPath();

  if (!backPath && onClick) {
    // No path, use click handler if provided
    return (
      <button onClick={onClick} className={className}>
        {label}
      </button>
    );
  }

  if (!backPath) {
    return null;
  }

  return (
    <Link href={backPath} className={className}>
      {label}
    </Link>
  );
}
