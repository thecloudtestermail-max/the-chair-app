/**
 * Phase 4: Platform Account Pages
 * 
 * /account page now shows:
 * - All appointments across all salons user has booked with
 * - Saved/favorited salons and barbers
 * - Quick access to manage accounts at each salon
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useCustomerAuth } from '@/hooks/useCustomerAuth';
import styles from './page.module.css';

interface Appointment {
  _id: string;
  salonName: string;
  tenantSlug: string;
  barberName: string;
  serviceName: string;
  dateTime: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
}

interface SavedItem {
  _id: string;
  type: 'salon' | 'barber';
  name: string;
  salonSlug: string;
  slug?: string;
}

export default function AccountPage() {
  const router = useRouter();
  const { customer } = useCustomerAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) {
      router.push('/login');
      return;
    }

    Promise.all([
      fetch('/api/customer-auth/appointments').then((r) => (r.ok ? r.json() : { appointments: [] })),
      fetch('/api/customer-auth/saved').then((r) => (r.ok ? r.json() : { saved: [] })),
    ])
      .then(([apptData, savedData]) => {
        setAppointments(apptData.appointments || []);
        setSaved(savedData.saved || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customer, router]);

  if (loading) return <SkeletonLines count={8} />;

  const upcomingAppointments = appointments.filter((a) => new Date(a.dateTime) > new Date());
  const pastAppointments = appointments.filter((a) => new Date(a.dateTime) <= new Date());

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.heading}>My Account</h1>
        <p className={styles.subheading}>Hi, {customer?.name.split(' ')[0]}</p>
      </div>

      {/* Upcoming Appointments */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Upcoming Appointments</h2>
        {upcomingAppointments.length === 0 ? (
          <EmptyState
            title="No upcoming appointments"
            description="Browse salons and book your next appointment."
            action={<Link href="/"><Button>Explore salons</Button></Link>}
          />
        ) : (
          <div className={styles.appointmentList}>
            {upcomingAppointments.map((apt) => (
              <div key={apt._id} className={styles.appointmentCard}>
                <div className={styles.aptInfo}>
                  <h3 className={styles.aptSalon}>{apt.salonName}</h3>
                  <p className={styles.aptDetails}>
                    {apt.serviceName} with {apt.barberName}
                  </p>
                  <p className={styles.aptTime}>
                    {new Date(apt.dateTime).toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <span className={[styles.status, styles[`status-${apt.status}`]].join(' ')}>
                    {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                  </span>
                </div>
                <Link href={`/t/${apt.tenantSlug}`}>
                  <Button variant="outline" size="small">
                    View salon
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Saved Salons & Barbers */}
      {saved.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Saved</h2>
          <div className={styles.savedGrid}>
            {saved.map((item) => (
              <Link
                key={item._id}
                href={
                  item.type === 'salon'
                    ? `/t/${item.salonSlug}`
                    : `/t/${item.salonSlug}/barbers/${item.slug}`
                }
                className={styles.savedCard}
              >
                <span className={styles.savedIcon}>
                  {item.type === 'salon' ? '🏛️' : '✂️'}
                </span>
                <span className={styles.savedName}>{item.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Past Appointments</h2>
          <div className={styles.appointmentList}>
            {pastAppointments.slice(0, 5).map((apt) => (
              <div key={apt._id} className={styles.appointmentCard} style={{ opacity: 0.7 }}>
                <div className={styles.aptInfo}>
                  <h3 className={styles.aptSalon}>{apt.salonName}</h3>
                  <p className={styles.aptDetails}>{apt.serviceName}</p>
                  <p className={styles.aptTime}>
                    {new Date(apt.dateTime).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Account Management */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Settings</h2>
        <div className={styles.settings}>
          <Link href="/account/profile">
            <Button fullWidth variant="outline">
              Edit profile
            </Button>
          </Link>
          <Link href="/account/password">
            <Button fullWidth variant="outline">
              Change password
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
