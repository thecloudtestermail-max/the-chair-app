# The Chair App — Navigation Architecture

## Overview

This document describes the navigation system implemented to address the three "worlds" (discovery, salon, console) that now coexist in The Chair App.

### The Three Worlds

1. **Root (Discovery)** – `/` and `/account`, `/login`, `/reset-password`
   - Entry point for the platform
   - Cross-tenant search and discovery
   - Customer account (not tied to a salon)

2. **Salon** – `/t/{tenantSlug}/*`
   - Customer-facing booking and appointment pages
   - Barber profiles
   - Public salon pages
   - Sign in for both customers and staff

3. **Console** – `/t/{tenantSlug}/dashboard/*`
   - Staff-only operations (appointments, services, team management)
   - Protected by staff session check
   - Operations staff can access from the salon view

4. **Admin** – `/admin/*`
   - Platform-level administration
   - Super-admin only
   - Separate from salon/console hierarchy

## Route Map (`src/lib/navMap.ts`)

The single source of truth for all routes. Defines:
- Path patterns (using `{slug}` notation for dynamic segments)
- World ownership (which "world" each route belongs to)
- Parent relationships (for smart back links)
- Protection level (staff, admin, customer, or public)

### Using the Route Map

```typescript
import { findRoute, getParentPath, isProtected } from '@/lib/navMap';

// Find a route by pathname
const route = findRoute('/t/barbershop-1/book');
// => { path: '/t/{tenantSlug}/book', world: 'salon', label: 'Book appointment', ... }

// Get the parent of a route (respects tenantSlug)
const parent = getParentPath('/t/barbershop-1/book');
// => '/t/barbershop-1'

// Check if a route requires auth
if (isProtected(route)) {
  // show sign-in prompt
}
```

## Smart Back Links

### `BackLink` Component

A component that automatically computes the correct back destination within the user's current world. Never throws a user out of their world.

```typescript
import { BackLink } from '@/components/BackLink';

// Basic usage — computes back path automatically
<BackLink />

// With custom destination
<BackLink href="/t/{tenantSlug}" label="← Back to salon" />

// As a button (for modals, overlays)
<BackButton onClick={handleClose} label="Close" />
```

### `useNavigation` Hook

Tracks navigation history within a world and provides smart back link computation.

```typescript
'use client';

import { useNavigation } from '@/hooks/useNavigation';

export function MyComponent() {
  const nav = useNavigation();
  
  return (
    <>
      <p>Current world: {nav.world}</p>
      <p>Can go back to: {nav.getBackLabel()}</p>
      <a href={nav.getBackPath()}>Back</a>
    </>
  );
}
```

### How It Works

1. **Navigation History**: Each world maintains its own history stack.
2. **Route Map Fallback**: If no history, checks `navMap.ts` for declared parent.
3. **Slug Preservation**: Automatically preserves `{tenantSlug}`, `{barberId}`, etc. when going back.

## Tenant Tab Bar (`src/components/TenantTabBar.tsx`)

A persistent bottom tab bar on salon pages (`/t/{tenantSlug}/*`) that allows quick switching between contexts:

- **Home** – Salon homepage
- **Book** – Booking flow
- **My Bookings** – Customer's appointments (only shows if customer session exists)
- **Manage** – Staff dashboard (only shows if staff session exists)

### Usage

```typescript
<TenantTabBar
  tenantSlug="barbershop-1"
  isCustomer={!!customerSession}
  isStaff={!!staffSession}
  showDashboard={true} // Show even if not logged in, as a hint
/>
```

The tab bar is automatically included in `/t/[tenantSlug]/layout.tsx` for all salon pages.

## Protected Routes

### Layout Guards

Each protected world has a server-side layout that checks auth before rendering:

- `/admin/(protected)/layout.tsx` – Requires `super_admin` role
- `/t/[tenantSlug]/dashboard/layout.tsx` – Requires `staff` role + matching `tenantId`

If auth check fails, redirect to login page for that world.

### Client-Side Guards

For pages that need to react to auth state without redirecting:

```typescript
import { useCustomerAuth } from '@/hooks/useCustomerAuth';

export function MyPage() {
  const { customer, requireSignIn } = useCustomerAuth();
  
  if (!customer) {
    return <button onClick={() => requireSignIn()}>Sign in to continue</button>;
  }
  
  return <p>Welcome, {customer.name}</p>;
}
```

## Phase 0 Fixes (Already Implemented)

✅ **Dead Ends Fixed:**
1. Barber profile page (`/t/{tenantSlug}/barbers/{barberSlug}`) – Added back link to salon
2. Login pages (root `/login` and tenant `/t/{tenantSlug}/login`) – Added back links
3. Reset password page – Already had back link to login

✅ **Navigation Enhancements:**
1. Created central `navMap.ts` defining all routes and relationships
2. Created `useNavigation` hook for smart back link logic
3. Created `BackLink` component for easy integration
4. Created `TenantTabBar` for world switching on salon pages
5. Updated tenant layout to include tab bar for all salon pages

## Phase 1–7 (Future Work)

The remaining phases follow the plan documented in the navigation architecture:

- **Phase 1**: Barber page rebuild with Back links
- **Phase 2**: Booking wizard steps (already implemented)
- **Phase 3**: Platform account pages (Saved, My appointments)
- **Phase 4**: Console navigation improvements
- **Phase 5**: Empty states and error pages
- **Phase 6**: Delight features (stamps, animations, punched steppers)

## Best Practices

### Adding a New Route

1. Add it to `src/lib/navMap.ts` with a parent reference
2. Use `BackLink` component on the page (or `useNavigation` hook if you need the path)
3. Test that back links don't escape the world

### Changing Route Structure

1. Update `navMap.ts` first
2. Tests and links will inherit the new structure
3. No need to manually hunt down hardcoded `/` paths

### Protecting a Route

1. Add `protected: 'staff' | 'admin' | 'customer'` to the route in `navMap.ts`
2. Use layout guards (already in place) for redirects
3. Use component-level auth checks (like `useCustomerAuth`) for UI feedback

## Debugging

### Trace Navigation

```typescript
import { findRoute, getParentPath } from '@/lib/navMap';

const pathname = '/t/barbershop-1/book';
const route = findRoute(pathname);
const parent = getParentPath(pathname);

console.log('Route:', route);
console.log('Parent:', parent);
console.log('World:', route?.world);
```

### Check a Route's Protection

```typescript
import { findRoute, isProtected } from '@/lib/navMap';

const route = findRoute('/t/barbershop-1/dashboard');
console.log('Protected?', isProtected(route), route?.protected);
```

## Questions?

Refer to the component/hook source files for detailed JSDoc comments.
