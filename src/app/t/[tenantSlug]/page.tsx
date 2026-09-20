// src/app/t/[tenantSlug]/page.tsx
//
// Rebuilt for Part 2, Phase F: hero with real branding, barbers linking to
// their own profile pages, service categories, and a location section with
// a map + "Get directions" link. `settings?.branding` (dead — that field
// never existed on SiteSettings) is gone; branding now correctly reads
// from `tenant.branding` via tenantThemeStyle, same helper the layout uses.
'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { tenantThemeStyle } from '@/lib/tenantTheme';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { CustomerSignInModal } from '@/components/CustomerSignInModal';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { formatPrice, DEFAULT_CURRENCY } from '@/lib/currency';
import styles from './page.module.css';

const SalonMapView = dynamic(() => import('@/components/SalonMapView'), { ssr: false });

interface Review {
  _id: string;
  rating: number;
  text?: string;
  createdAt: string;
}

interface TenantDetails {
  tenant: { _id: string; name: string; branding?: any; currency?: string };
  settings?: {
    title: string;
    description?: string;
    logoUrl?: string;
    coverImageUrl?: string;
    phone?: string;
    email?: string;
    location?: { address: string; lat: number; lng: number };
  };
  barbers: Array<{ _id: string; name: string; slug: string; imageUrl?: string; tags?: string[] }>;
  services: Array<{ _id: string; name: string; price: number; duration: number; description?: string; imageUrl?: string; categoryId?: string }>;
  categories: Array<{ _id: string; name: string; imageUrl?: string }>;
  reviews: Review[];
  averageRating: number | null;
}

export default function TenantHome() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const [data, setData] = useState<TenantDetails | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const { customer, signInOpen, setSignInOpen, requireSignIn, onSignedIn } = useCustomerAuth();

  useEffect(() => {
    fetch(`/api/public/tenants/${tenantSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, [tenantSlug]);

  useEffect(() => {
    if (!customer || !data) return;
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : []))
      .then((favs) => setIsFavorite(favs.some((f: any) => f.tenantId === data.tenant._id)));
  }, [customer, data]);

  const toggleFavorite = () => {
    if (!data) return;
    requireSignIn(async () => {
      if (isFavorite) {
        await fetch(`/api/favorites?tenantId=${data.tenant._id}`, { method: 'DELETE' });
        setIsFavorite(false);
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: data.tenant._id }),
        });
        setIsFavorite(true);
      }
    });
  };

  if (!data) return <SkeletonLines count={8} />;

  const { tenant, settings, barbers, services, categories, reviews, averageRating } = data;
  const location = settings?.location;
  const currency = tenant.currency || DEFAULT_CURRENCY;
  const uncategorized = services.filter((s) => !s.categoryId || !categories.some((c) => c._id === s.categoryId));

  return (
    <div style={tenantThemeStyle(tenant.branding)}>
      <section
        className={styles.hero}
        style={settings?.coverImageUrl ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${settings.coverImageUrl})` } : undefined}
      >
        <div className={styles.heroTop}>
          <div>
            <h1 className={styles.heroTitle}>{settings?.title || tenant.name}</h1>
            {averageRating != null && (
              <p className={styles.heroRating}>
                ★ {averageRating.toFixed(1)} ({reviews.length} review{reviews.length === 1 ? '' : 's'})
              </p>
            )}
          </div>
          <button className={styles.favoriteButton} onClick={toggleFavorite} aria-pressed={isFavorite}>
            {isFavorite ? '♥ Saved' : '♡ Save'}
          </button>
        </div>
        {settings?.description && <p className={styles.heroDescription}>{settings.description}</p>}
        <Link href={`/t/${tenantSlug}/book`}>
          <Button size="lg">Book an appointment</Button>
        </Link>
      </section>

      {barbers.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Our barbers</h2>
          <div className={styles.barberGrid}>
            {barbers.map((b) => (
              <Link key={b._id} href={`/t/${tenantSlug}/barbers/${b.slug}`} className={styles.barberCard}>
                {b.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt="" className={styles.barberAvatar} />
                ) : (
                  <div className={styles.barberAvatarPlaceholder}>{b.name.charAt(0)}</div>
                )}
                <p className={styles.barberName}>{b.name}</p>
                {b.tags && b.tags.length > 0 && <p className={styles.barberTags}>{b.tags.slice(0, 2).join(' · ')}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(categories.length > 0 || services.length > 0) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Services</h2>
          {services.length === 0 ? (
            <EmptyState title="No services listed yet" />
          ) : (
            <>
              {categories.map((c) => {
                const inCategory = services.filter((s) => s.categoryId === c._id);
                if (inCategory.length === 0) return null;
                return (
                  <div key={c._id} className={styles.serviceCategoryGroup}>
                    <h3 className={styles.serviceCategoryTitle}>{c.name}</h3>
                    <div className={styles.serviceMenu}>
                      {inCategory.map((s) => (
                        <Link key={s._id} href={`/t/${tenantSlug}/book?service=${s._id}`} className={styles.serviceMenuRow}>
                          <div className={styles.serviceMenuInfo}>
                            <p className={styles.serviceMenuName}>{s.name}</p>
                            {s.description && <p className={styles.serviceMenuDescription}>{s.description}</p>}
                            <p className={styles.serviceMenuMeta}>{s.duration} min</p>
                          </div>
                          <span className={styles.serviceMenuPrice}>{formatPrice(s.price, currency)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
              {uncategorized.length > 0 && (
                <div className={styles.serviceCategoryGroup}>
                  {categories.length > 0 && <h3 className={styles.serviceCategoryTitle}>More services</h3>}
                  <div className={styles.serviceMenu}>
                    {uncategorized.map((s) => (
                      <Link key={s._id} href={`/t/${tenantSlug}/book?service=${s._id}`} className={styles.serviceMenuRow}>
                        <div className={styles.serviceMenuInfo}>
                          <p className={styles.serviceMenuName}>{s.name}</p>
                          {s.description && <p className={styles.serviceMenuDescription}>{s.description}</p>}
                          <p className={styles.serviceMenuMeta}>{s.duration} min</p>
                        </div>
                        <span className={styles.serviceMenuPrice}>{formatPrice(s.price, currency)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {location?.lat != null && location?.lng != null && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Find us</h2>
          <div className={styles.locationRow}>
            <div className={styles.locationInfo}>
              <p className={styles.address}>{location.address}</p>
              {settings?.phone && <p className={styles.contactLine}>{settings.phone}</p>}
              <a
                className={styles.directionsLink}
                href={`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions →
              </a>
            </div>
            <div className={styles.mapWrap}>
              <SalonMapView lat={location.lat} lng={location.lng} />
            </div>
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What customers say</h2>
          <div className={styles.reviewGrid}>
            {reviews.slice(0, 6).map((r) => (
              <div key={r._id} className={styles.reviewCard}>
                <p className={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</p>
                {r.text && <p className={styles.reviewText}>{r.text}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {barbers.length === 0 && categories.length === 0 && (
        <EmptyState title="This salon is still setting up" description="Check back soon." />
      )}

      <CustomerSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
    </div>
  );
}
