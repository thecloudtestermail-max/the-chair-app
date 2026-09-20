/**
 * Phase 2: Barber Page Rebuild
 * 
 * Enhancements:
 * - Better visual hierarchy
 * - Reviews section prominent
 * - Improved call-to-action placement
 * - Social proof (follower count, review rating)
 * - Portfolio as lazy-loaded grid
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { BackLink } from '@/components/BackLink';
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
  averageRating?: number;
  reviewCount?: number;
}

export default function BarberProfilePage() {
  const { tenantSlug, barberSlug } = useParams<{ tenantSlug: string; barberSlug: string }>();
  const [barber, setBarber] = useState<Barber | null | undefined>(undefined);
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
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

  const hasReviews = barber.reviewCount && barber.reviewCount > 0;
  const hasPortfolio = barber.portfolio && barber.portfolio.length > 0;

  return (
    <div className={styles.wrap}>
      <p style={{ padding: 'var(--space-4)', margin: 0 }}>
        <BackLink href={`/t/${tenantSlug}`} label="← Back to salon" className={styles.backLink} />
      </p>

      {/* Hero Section */}
      <div className={styles.heroSection}>
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
            
            {/* Social Proof */}
            {(hasReviews || barber.followerCount) && (
              <div className={styles.socialProof}>
                {hasReviews && (
                  <span className={styles.proofItem}>
                    ⭐ {barber.averageRating?.toFixed(1) || 'N/A'} ({barber.reviewCount} reviews)
                  </span>
                )}
                {barber.followerCount && (
                  <span className={styles.proofItem}>
                    👥 {barber.followerCount.toLocaleString()} followers
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {barber.bio && <p className={styles.bio}>{barber.bio}</p>}

        {/* Primary CTA */}
        <div className={styles.actionRow}>
          <Link href={`/t/${tenantSlug}/book?barber=${barber._id}`}>
            <Button size="large" fullWidth>
              Book with {barber.name.split(' ')[0]}
            </Button>
          </Link>
          <FollowButton
            barberId={barber._id}
            initialFollowed={barber.isFollowedByMe || false}
            initialFollowerCount={barber.followerCount || 0}
            requireSignIn={requireSignIn}
          />
        </div>
      </div>

      {/* Portfolio Section */}
      {hasPortfolio && (
        <section className={styles.portfolioSection}>
          <h2 className={styles.sectionTitle}>Portfolio</h2>
          <div className={styles.portfolioGrid}>
            {barber.portfolio!.slice(0, 6).map((url, i) => (
              <div key={i} className={styles.portfolioItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Work by ${barber.name}, photo ${i + 1}`}
                  className={styles.portfolioImage}
                  loading={portfolioLoaded || i < 3 ? 'eager' : 'lazy'}
                  onLoad={() => setPortfolioLoaded(true)}
                />
              </div>
            ))}
          </div>
          {barber.portfolio!.length > 6 && (
            <p className={styles.viewMore}>
              +{barber.portfolio!.length - 6} more photos
            </p>
          )}
        </section>
      )}

      {/* Reviews/Social Feed Section */}
      <section className={styles.feedSection}>
        <h2 className={styles.sectionTitle}>From {barber.name.split(' ')[0]}</h2>
        <SocialFeed barberId={barber._id} requireSignIn={requireSignIn} />
      </section>

      <CustomerSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
    </div>
  );
}
