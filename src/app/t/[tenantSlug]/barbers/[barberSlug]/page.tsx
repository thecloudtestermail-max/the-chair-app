// src/app/t/[tenantSlug]/barbers/[barberSlug]/page.tsx
//
// New in Part 2 — didn't exist before. Reuses the public tenant-details
// endpoint (already returns all barbers) rather than adding a new route
// per barber; finds the matching slug client-side.
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CustomerSignInModal } from '@/components/CustomerSignInModal';
import { SocialFeed } from '@/components/SocialFeed';
import { FollowButton } from '@/components/FollowButton';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import styles from './page.module.css';

interface Barber {
  _id: string;
  name: string;
  slug: string;
  imageUrl?: string;
  bio?: string;
  portfolio?: string[];
  tags?: string[];
  followerCount?: number;
  isFollowedByMe?: boolean;
}

export default function BarberProfilePage() {
  const { tenantSlug, barberSlug } = useParams<{ tenantSlug: string; barberSlug: string }>();
  const [barber, setBarber] = useState<Barber | null | undefined>(undefined);
  const { signInOpen, setSignInOpen, requireSignIn, onSignedIn } = useCustomerAuth();

  useEffect(() => {
    fetch(`/api/public/tenants/${tenantSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const found = data?.barbers?.find((b: Barber) => b.slug === barberSlug);
        setBarber(found || null);
      });
  }, [tenantSlug, barberSlug]);

  if (barber === undefined) return <SkeletonLines count={6} />;
  if (barber === null) return <EmptyState title="Barber not found" />;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        {barber.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={barber.imageUrl} alt="" className={styles.avatar} />
        ) : (
          <div className={styles.avatarPlaceholder}>{barber.name.charAt(0)}</div>
        )}
        <div>
          <h1 className={styles.name}>{barber.name}</h1>
          {barber.tags && barber.tags.length > 0 && <p className={styles.tags}>{barber.tags.join(' · ')}</p>}
        </div>
      </div>

      {barber.bio && <p className={styles.bio}>{barber.bio}</p>}

      <div className={styles.actionRow}>
        <Link href={`/t/${tenantSlug}/book?barber=${barber._id}`}>
          <Button>Book with {barber.name.split(' ')[0]}</Button>
        </Link>
        <FollowButton
          barberId={barber._id}
          initialFollowed={barber.isFollowedByMe || false}
          initialFollowerCount={barber.followerCount || 0}
          requireSignIn={requireSignIn}
        />
      </div>

      {barber.portfolio && barber.portfolio.length > 0 && (
        <section className={styles.portfolioSection}>
          <h2 className={styles.portfolioTitle}>Portfolio</h2>
          <div className={styles.portfolioGrid}>
            {barber.portfolio.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`Work by ${barber.name}, photo ${i + 1}`} className={styles.portfolioImage} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.portfolioSection}>
        <h2 className={styles.portfolioTitle}>Posts</h2>
        <SocialFeed barberId={barber._id} requireSignIn={requireSignIn} />
      </section>

      <CustomerSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
    </div>
  );
}
