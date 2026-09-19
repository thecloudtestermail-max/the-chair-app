// src/components/SocialFeed.tsx
//
// Part 3 — the stylist social feed, either global (no barberId — mounted on
// the main discovery page) or scoped to one barber (mounted on their
// public profile page). Auth state (customer/requireSignIn/etc.) is passed
// in as props from the parent's single useCustomerAuth() instance, rather
// than owned here, so a page never ends up with two independent
// customer-auth checks / CustomerSignInModals.
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { PostCard, FeedPost } from '@/components/PostCard';
import styles from './SocialFeed.module.css';

export function SocialFeed({
  barberId,
  requireSignIn,
}: {
  barberId?: string;
  requireSignIn: (action: () => void) => void;
}) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const buildUrl = (before?: string) => {
    const params = new URLSearchParams();
    if (barberId) params.set('barberId', barberId);
    if (before) params.set('before', before);
    return `/api/posts?${params.toString()}`;
  };

  useEffect(() => {
    setPosts(null);
    fetch(buildUrl())
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setPosts(data);
        setHasMore(data.length > 0);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId]);

  const loadMore = async () => {
    if (!posts || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(posts[posts.length - 1].createdAt));
      const data = await res.json();
      setPosts((prev) => [...(prev || []), ...data]);
      setHasMore(data.length > 0);
    } finally {
      setLoadingMore(false);
    }
  };

  if (posts === null) return <SkeletonLines count={3} />;

  if (posts.length === 0) {
    return (
      <EmptyState
        title="No posts yet"
        description={barberId ? 'This stylist hasn\'t posted anything yet.' : 'Check back soon — stylists are just getting started.'}
      />
    );
  }

  return (
    <div className={styles.feed}>
      {posts.map((p) => (
        <PostCard key={p._id} post={p} requireSignIn={requireSignIn} />
      ))}
      {hasMore && (
        <Button variant="secondary" loading={loadingMore} onClick={loadMore} fullWidth>
          Load more
        </Button>
      )}
    </div>
  );
}
