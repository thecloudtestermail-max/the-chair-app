// src/app/t/[tenantSlug]/dashboard/waitlist/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import styles from './page.module.css';

interface WaitlistEntry {
  _id: string;
  dateTime: string;
  barberName?: string;
  serviceName?: string;
  customerName?: string;
  customerPhone?: string;
}

interface Barber {
  _id: string;
  name: string;
}
interface Service {
  _id: string;
  name: string;
  eligibleBarberIds?: string[];
}

const emptyForm = { customerName: '', customerEmail: '', customerPhone: '', barberId: '', serviceId: '' };

export default function WaitlistPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<WaitlistEntry[] | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const selectedService = services.find((s) => s._id === form.serviceId);
  const eligibleBarbers = useMemo(() => {
    const restriction = selectedService?.eligibleBarberIds;
    if (!restriction || restriction.length === 0) return barbers;
    return barbers.filter((b) => restriction.includes(b._id));
  }, [barbers, selectedService]);

  const load = () => {
    fetch('/api/appointments')
      .then((r) => (r.ok ? r.json() : []))
      .then((all) => setEntries(all.filter((a: any) => a.status === 'waitlist')));
  };

  useEffect(() => {
    load();
    fetch('/api/barbers').then((r) => (r.ok ? r.json() : [])).then(setBarbers);
    fetch('/api/services').then((r) => (r.ok ? r.json() : [])).then(setServices);
  }, []);

  const addWalkIn = async () => {
    setSaving(true);
    try {
      const customerRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.customerName, email: form.customerEmail, phone: form.customerPhone }),
      });
      const customer = await customerRes.json();
      if (!customerRes.ok) {
        toast.show(customer.message || 'Could not add customer', 'error');
        return;
      }

      const apptRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer._id,
          barberId: form.barberId,
          serviceId: form.serviceId,
          status: 'waitlist',
          source: 'walk-in',
        }),
      });
      const appt = await apptRes.json();
      if (apptRes.ok) {
        toast.show('Added to waitlist', 'success');
        setModalOpen(false);
        setForm(emptyForm);
        load();
      } else {
        toast.show(appt.message || 'Could not add to waitlist', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const seatNow = async (id: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: id, status: 'confirmed' }),
    });
    if (res.ok) {
      toast.show('Seated', 'success');
      load();
    } else {
      toast.show('Could not update', 'error');
    }
  };

  const cancel = async (id: string) => {
    const res = await fetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: id, status: 'cancelled' }),
    });
    if (res.ok) {
      toast.show('Removed from waitlist', 'success');
      load();
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Waitlist</h1>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Add walk-in
        </Button>
      </div>

      {entries === null ? (
        <SkeletonLines count={3} />
      ) : entries.length === 0 ? (
        <EmptyState title="Waitlist is empty" description="Walk-ins you add here queue up without a fixed time slot." action={<Button size="sm" onClick={() => setModalOpen(true)}>Add walk-in</Button>} />
      ) : (
        <div className={styles.list}>
          {entries.map((e, i) => (
            <div key={e._id} className={styles.row}>
              <span className={styles.position}>#{i + 1}</span>
              <div className={styles.body}>
                <p className={styles.name}>{e.customerName || 'Walk-in customer'}</p>
                <p className={styles.meta}>
                  {e.serviceName || 'Service'} · waiting for {e.barberName || 'any barber'}
                </p>
              </div>
              <div className={styles.actions}>
                <Button size="sm" onClick={() => seatNow(e._id)}>
                  Seat now
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cancel(e._id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add walk-in to waitlist">
        <Input label="Customer name" required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
        <Input label="Email" required type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
        <Input label="Phone" required value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
        <Select
          label="Service"
          required
          value={form.serviceId}
          onChange={(e) => {
            const serviceId = e.target.value;
            const nextService = services.find((s) => s._id === serviceId);
            const restriction = nextService?.eligibleBarberIds;
            // Changing to a service that restricts who can do it may make
            // the currently-picked barber invalid — clear it instead of
            // silently keeping an impossible combination selected.
            const barberStillValid = !restriction || restriction.length === 0 || restriction.includes(form.barberId);
            setForm({ ...form, serviceId, barberId: barberStillValid ? form.barberId : '' });
          }}
        >
          <option value="">Select a service</option>
          {services.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select label="Barber" required value={form.barberId} onChange={(e) => setForm({ ...form, barberId: e.target.value })}>
          <option value="">Select a barber</option>
          {eligibleBarbers.map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Button
          fullWidth
          loading={saving}
          onClick={addWalkIn}
          disabled={!form.customerName || !form.customerEmail || !form.customerPhone || !form.barberId || !form.serviceId}
        >
          Add to waitlist
        </Button>
      </Modal>
    </div>
  );
}
