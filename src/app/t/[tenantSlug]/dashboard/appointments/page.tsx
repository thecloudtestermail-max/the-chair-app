// src/app/t/[tenantSlug]/dashboard/appointments/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Badge, statusTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useOptionalRole } from '@/hooks/useRole';
import { useCurrency } from '@/hooks/useCurrency';
import { formatPrice } from '@/lib/currency';
import styles from './page.module.css';

interface Appointment {
  _id: string;
  dateTime: string;
  status: string;
  source?: string;
  notes?: string;
  barberName?: string;
  serviceName?: string;
  servicePrice?: number;
  customerName?: string;
  customerPhone?: string;
}

const STATUS_OPTIONS = ['pending', 'confirmed', 'completed', 'cancelled'];
// A barber works their own bookings forward (confirm, complete, cancel) but
// can't reopen one; the server enforces the same list (api/appointments PUT).
const BARBER_STATUS_OPTIONS = ['confirmed', 'completed', 'cancelled'];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsBoard() {
  const toast = useToast();
  const role = useOptionalRole();
  const currency = useCurrency();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [dateFilter, setDateFilter] = useState(isoDate(new Date()));
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => fetch('/api/appointments').then((r) => (r.ok ? r.json() : [])).then(setAppointments);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!appointments) return [];
    return appointments.filter((a) => {
      if (a.status === 'waitlist') return false; // waitlist has its own view
      const matchesDate = dateFilter ? isoDate(new Date(a.dateTime)) === dateFilter : true;
      const matchesStatus = statusFilter === 'all' ? true : a.status === statusFilter;
      return matchesDate && matchesStatus;
    });
  }, [appointments, dateFilter, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: id, status }),
    });
    if (res.ok) {
      toast.show('Status updated', 'success');
      load();
    } else {
      const data = await res.json();
      toast.show(data.message || 'Failed to update', 'error');
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Appointments</h1>
        <div className={styles.filters}>
          <input
            type="date"
            className={styles.dateInput}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            aria-label="Filter by date"
          />
          <button className={styles.clearDate} onClick={() => setDateFilter('')}>
            All dates
          </button>
          <select className={styles.statusSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {appointments === null ? (
        <SkeletonLines count={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No appointments match" description="Try a different date or status filter." />
      ) : (
        <div className={styles.list}>
          {filtered.map((a) => (
            <div key={a._id} className={styles.row}>
              <div className={styles.timeCol}>
                <span className={styles.time}>
                  {new Date(a.dateTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className={styles.date}>{new Date(a.dateTime).toLocaleDateString()}</span>
              </div>
              <div className={styles.mainCol}>
                <p className={styles.service}>
                  {a.serviceName || 'Service'} {a.source === 'walk-in' && <span className={styles.walkIn}>walk-in</span>}
                </p>
                <p className={styles.meta}>
                  {a.customerName || 'Customer'} · with {a.barberName || 'barber'} · <span className={styles.mono}>{a.servicePrice != null ? formatPrice(a.servicePrice, currency) : '—'}</span>
                </p>
                {a.notes && <p className={styles.notes}>{a.notes}</p>}
              </div>
              <div className={styles.statusCol}>
                <Badge tone={statusTone(a.status)} />
                <select
                  className={styles.statusChange}
                  value={a.status}
                  onChange={(e) => updateStatus(a._id, e.target.value)}
                  aria-label="Change status"
                >
                  {(role === 'barber' ? BARBER_STATUS_OPTIONS : STATUS_OPTIONS).map((s) => (
                    <option key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                  {role === 'barber' && !BARBER_STATUS_OPTIONS.includes(a.status) && (
                    <option value={a.status} disabled>
                      {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                    </option>
                  )}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
