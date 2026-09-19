// src/components/FollowButton.tsx
//
// Part 3 — follow/unfollow a stylist. Same requireSignIn(...) pattern as
// toggleFavorite in src/app/page.tsx. Auth state is passed in from the
// parent (page-level useCustomerAuth() instance) rather than owned here,
// so a page with both a feed and a follow button doesn't mount two
// independent customer-auth checks / sign-in modals.
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function FollowButton({
  barberId,
  initialFollowed,
  initialFollowerCount,
  requireSignIn,
}: {
  barberId: string;
  initialFollowed: boolean;
  initialFollowerCount: number;
  requireSignIn: (action: () => void) => void;
}) {
  const [followed, setFollowed] = useState(initialFollowed);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  const toggle = () => {
    requireSignIn(async () => {
      if (followed) {
        await fetch(`/api/follows?barberId=${barberId}`, { method: 'DELETE' });
        setFollowed(false);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await fetch('/api/follows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barberId }),
        });
        setFollowed(true);
        setFollowerCount((c) => c + 1);
      }
    });
  };

  return (
    <Button variant={followed ? 'secondary' : 'primary'} size="sm" onClick={toggle}>
      {followed ? 'Following' : 'Follow'} · {followerCount}
    </Button>
  );
}
