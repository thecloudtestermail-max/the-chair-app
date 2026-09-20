/**
 * useNavigation.ts
 *
 * Manages navigation state and provides smart Back links that never
 * throw a user out of their current "world" (discovery/salon/console).
 *
 * This hook is optional for now—components can call the exported functions
 * directly. When we need stateful navigation history (multi-step flows),
 * this hook and a provider will coordinate it.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { findRoute, getParentPath } from '@/lib/navMap';
import type { AppWorld } from '@/lib/navMap';

/**
 * Stack of visited paths within the current world.
 * Used to compute a smart Back link that respects user's journey.
 */
interface NavigationState {
  world: AppWorld;
  current: string;
  previous: string | null;
}

/**
 * Hook to track navigation within a world and compute back links.
 * Each world (root, salon, console, admin) maintains its own history.
 */
export function useNavigation() {
  const pathname = usePathname();
  const route = findRoute(pathname);
  const world = route?.world ?? 'root';

  const [state, setState] = useState<Record<AppWorld, NavigationState>>({
    root: { world: 'root', current: '/', previous: null },
    salon: { world: 'salon', current: '/', previous: null },
    console: { world: 'console', current: '/', previous: null },
    admin: { world: 'admin', current: '/', previous: null },
  });

  // When pathname changes, update the history for this world
  useEffect(() => {
    setState((prev) => {
      const worldState = prev[world];
      if (worldState.current === pathname) return prev; // no change

      return {
        ...prev,
        [world]: {
          world,
          current: pathname,
          previous: worldState.current,
        },
      };
    });
  }, [pathname, world]);

  /**
   * Get the back path for the current world.
   * Returns the previous path in this world, or the world's root,
   * or the explicit parent from navMap, whichever is available.
   */
  const getBackPath = useCallback((): string => {
    const prev = state[world].previous;
    if (prev) return prev;

    // No previous in history, check navMap for declared parent
    const parent = getParentPath(pathname);
    if (parent) return parent;

    // Fall back to world root
    switch (world) {
      case 'root':
        return '/';
      case 'admin':
        return '/admin/login';
      case 'salon':
        // Preserve tenantSlug if in salon world
        const slugMatch = pathname.match(/^\/t\/([^/]+)/);
        return slugMatch ? `/t/${slugMatch[1]}` : '/';
      case 'console':
        const consoleMatch = pathname.match(/^\/t\/([^/]+)\/dashboard/);
        return consoleMatch ? `/t/${consoleMatch[1]}/dashboard` : '/';
    }
  }, [state, world, pathname]);

  /**
   * Get a label for the Back link based on where we're going.
   */
  const getBackLabel = useCallback((): string => {
    const target = getBackPath();
    const targetRoute = findRoute(target);
    if (!targetRoute) return '← Back';
    return `← ${targetRoute.label}`;
  }, [getBackPath]);

  return {
    world,
    current: pathname,
    previous: state[world].previous,
    getBackPath,
    getBackLabel,
  };
}

/**
 * Standalone function to compute a back link for a given pathname.
 * Used in components that don't call hooks or need server-side computation.
 */
export function computeBackPath(pathname: string): string | null {
  // Try navMap parent first
  const parent = getParentPath(pathname);
  if (parent) return parent;

  // Fallback: strip last segment and try that
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 1) {
    parts.pop();
    return `/${parts.join('/')}`;
  }

  // At a root, no back available
  return null;
}

/**
 * Check whether a route should be shown in breadcrumb/back navigation.
 */
export function shouldShowInNavigation(pathname: string): boolean {
  const route = findRoute(pathname);
  return !route?.hidden;
}
