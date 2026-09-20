// src/app/page.tsx
//
// Discovery surface. Rebuilt for Part 2 Phase F: service results now link
// to their salon (previously showed a price with no way to act on it —
// audit finding), and "Near me" adds geolocation-based distance sort via
// the search route's lat/lng params.
'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { CustomerSignInModal } from '@/components/CustomerSignInModal';
import { SocialFeed } from '@/components/SocialFeed';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import { useStaffSession, dashboardHref } from '@/hooks/useStaffSession';
import { formatPrice } from '@/lib/currency';
import styles from './page.module.css';

const DiscoveryMap = dynamic(() => import('@/components/DiscoveryMap'), { ssr: false });

interface TenantResult {
  _id: string;
  name: string;
  slug: string;
  branding?: { primaryColor: string };
  distanceKm?: number | null;
  lat?: number | null;
  lng?: number | null;
  barbers?: { _id: string; name: string; slug: string; imageUrl?: string }[];
}

interface ServiceResult {
  _id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantCurrency?: string;
  name: string;
  price: number;
  duration: number;
  imageUrl?: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [tenants, setTenants] = useState<TenantResult[]>([]);
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'discover' | 'feed'>('discover');
  const [resultsView, setResultsView] = useState<'stylised' | 'map' | 'split'>('split');
  const { customer, signInOpen, setSignInOpen, requireSignIn, onSignedIn, signOut } = useCustomerAuth();
  const { staff, clearStaff } = useStaffSession();
  const staffDashboard = dashboardHref(staff);

  useEffect(() => {
    if (!customer) {
      setFavoriteIds(new Set());
      return;
    }
    fetch('/api/favorites')
      .then((r) => (r.ok ? r.json() : []))
      .then((favs) => setFavoriteIds(new Set(favs.map((f: any) => f.tenantId))));
  }, [customer]);

  // The backend already returns a full listing for an empty query — run it
  // on mount so visitors see something before they've typed anything.
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavorite = (tenantId: string) => {
    requireSignIn(async () => {
      const isFav = favoriteIds.has(tenantId);
      if (isFav) {
        await fetch(`/api/favorites?tenantId=${tenantId}`, { method: 'DELETE' });
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(tenantId);
          return next;
        });
      } else {
        await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        });
        setFavoriteIds((prev) => new Set(prev).add(tenantId));
      }
    });
  };

  const runSearch = async (overrideCoords?: { lat: number; lng: number } | null) => {
    setLoading(true);
    setSearched(true);
    try {
      const useCoords = overrideCoords !== undefined ? overrideCoords : coords;
      const params = new URLSearchParams({ q: query });
      if (useCoords) {
        params.set('lat', String(useCoords.lat));
        params.set('lng', String(useCoords.lng));
      }
      const res = await fetch(`/api/public/search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
        setServices(data.services || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

  const useNearMe = () => {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        setLocating(false);
        runSearch(next);
      },
      () => setLocating(false)
    );
  };

  return (
    <>
      <header className={styles.siteHeader}>
        <div className={styles.siteHeaderInner}>
          <Link href="/" className={styles.siteBrand}>
            The Chair App
          </Link>
          {customer === undefined || staff === undefined ? null : customer || staffDashboard ? (
            <div className={styles.accountArea}>
              {customer && <span className={styles.accountName}>Hi, {customer.name.split(' ')[0]}</span>}
              {staffDashboard && (
                <Link href={staffDashboard} className={styles.accountButton}>
                  Dashboard
                </Link>
              )}
              {customer && (
                <Link href="/account" className={styles.accountButton}>
                  Account
                </Link>
              )}
              <button
                className={styles.accountButton}
                onClick={async () => {
                  await signOut();
                  clearStaff();
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <button className={styles.accountButtonPrimary} onClick={() => setSignInOpen(true)}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
      <h1 className={styles.title}>The Chair App</h1>
      <p className={styles.subtitle}>Discover and book appointments at top salons and barbershops</p>

      <div className={styles.viewSwitch}>
        <Button variant={view === 'discover' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('discover')}>
          Discover salons
        </Button>
        <Button variant={view === 'feed' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('feed')}>
          Stylist feed
        </Button>
      </div>

      {view === 'feed' && <SocialFeed requireSignIn={requireSignIn} />}

      {view === 'discover' && (
      <>
      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search salons or services…"
          className={styles.searchInput}
          aria-label="Search"
        />
        <Button type="submit" loading={loading}>
          Search
        </Button>
        <Button type="button" variant="secondary" loading={locating} onClick={useNearMe}>
          Near me
        </Button>
      </form>

      {coords && <p className={styles.nearMeNote}>Showing results sorted by distance from you.</p>}

      {tenants.length > 0 && (
        <div className={styles.resultsViewSwitch} role="group" aria-label="Results view">
          <button
            type="button"
            className={[styles.resultsViewButton, resultsView === 'stylised' ? styles.resultsViewButtonActive : ''].join(' ')}
            aria-pressed={resultsView === 'stylised'}
            onClick={() => setResultsView('stylised')}
          >
            Stylised
          </button>
          <button
            type="button"
            className={[styles.resultsViewButton, resultsView === 'map' ? styles.resultsViewButtonActive : ''].join(' ')}
            aria-pressed={resultsView === 'map'}
            onClick={() => setResultsView('map')}
          >
            Map
          </button>
          <button
            type="button"
            className={[styles.resultsViewButton, resultsView === 'split' ? styles.resultsViewButtonActive : ''].join(' ')}
            aria-pressed={resultsView === 'split'}
            onClick={() => setResultsView('split')}
          >
            Both
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonLines count={4} />
      ) : (
        <>
          {searched && tenants.length === 0 && services.length === 0 && (
            <EmptyState title="No results" description="Try a different search term." />
          )}

          {tenants.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Salons</h2>
              <div className={resultsView === 'split' ? styles.splitView : undefined}>
                {(resultsView === 'map' || resultsView === 'split') && (
                  tenants.some((t) => t.lat != null && t.lng != null) ? (
                    <div className={styles.mapWrap}>
                      <DiscoveryMap
                        center={coords}
                        height={resultsView === 'split' ? 520 : 420}
                        pins={tenants
                          .filter((t) => t.lat != null && t.lng != null)
                          .map((t) => ({ _id: t._id, name: t.name, slug: t.slug, lat: t.lat!, lng: t.lng!, barbers: t.barbers || [] }))}
                      />
                    </div>
                  ) : (
                    <EmptyState title="No mapped salons" description="None of these salons have a location on file yet. Try the stylised view instead." />
                  )
                )}

                {(resultsView === 'stylised' || resultsView === 'split') && (
                  <div className={styles.tenantGrid}>
                    {tenants.map((t) => (
                      <div key={t._id} className={styles.tenantCardWrap}>
                        <Link href={`/t/${t.slug}`} className={styles.tenantCard} style={{ borderLeftColor: t.branding?.primaryColor || 'var(--brass)' }}>
                          <strong>{t.name}</strong>
                          {t.distanceKm != null && <span className={styles.distance}>{t.distanceKm.toFixed(1)} km away</span>}
                        </Link>
                        <button
                          className={styles.favoriteButton}
                          aria-pressed={favoriteIds.has(t._id)}
                          aria-label={favoriteIds.has(t._id) ? `Remove ${t.name} from favorites` : `Save ${t.name} as favorite`}
                          onClick={() => toggleFavorite(t._id)}
                        >
                          {favoriteIds.has(t._id) ? '♥' : '♡'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {services.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Services</h2>
              <div className={styles.serviceGrid}>
                {services.map((s) => (
                  <Link key={s._id} href={`/t/${s.tenantSlug}`} className={styles.serviceCard}>
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt="" className={styles.serviceImage} />
                    )}
                    <strong>{s.name}</strong>
                    <p className={styles.serviceMeta}>
                      <span className={styles.mono}>{formatPrice(s.price, s.tenantCurrency)}</span> · {s.duration} min
                    </p>
                    <p className={styles.serviceTenant}>at {s.tenantName}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      </>
      )}

      <CustomerSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
      </main>
    </>
  );
}
