// src/app/t/[tenantSlug]/dashboard/customers/page.tsx
//
// Nav-audit follow-up: the empty state already promised "or a walk-in is
// added", but nothing in this page ever called it — /api/customers has had
// a working POST (find-or-attach by email) and PUT (name/phone) since this
// page was built; only the UI to reach them was missing. Front desk staff
// had no way to register a walk-in without that customer booking online
// first.
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import styles from './page.module.css';

interface Customer {
  _id: string;
  name: string;
  email: string;
  phone: string;
  loyaltyPoints: Record<string, number>;
}

const emptyForm = { name: '', email: '', phone: '' };

export default function CustomersPage() {
  const role = useRole();
  const allowed = role === 'admin' || role === 'receptionist';
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ open: boolean; editing?: Customer }>({ open: false });
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => fetch('/api/customers').then((r) => (r.ok ? r.json() : [])).then(setCustomers);

  useEffect(() => {
    if (!allowed) return;
    load();
    fetch('/api/tenant/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setTenantId(data?.tenant?._id || null));
  }, [allowed]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Managing customers is only available to admins and receptionists." />;
  }

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, query]);

  const openNew = () => {
    setForm(emptyForm);
    setModal({ open: true });
  };
  const openEdit = (c: Customer) => {
    setForm({ name: c.name, email: c.email, phone: c.phone });
    setModal({ open: true, editing: c });
  };

  const save = async () => {
    setSaving(true);
    try {
      const editing = modal.editing;
      const res = await fetch('/api/customers', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { _id: editing._id, name: form.name, phone: form.phone } : form),
      });
      if (res.ok) {
        toast.show(editing ? 'Customer updated' : 'Customer added', 'success');
        setModal({ open: false });
        load();
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to save customer', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Customers</h1>
        <div className={styles.headerActions}>
          <input
            className={styles.search}
            placeholder="Search by name, email, or phone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search customers"
          />
          <Button size="sm" onClick={openNew}>
            Add customer
          </Button>
        </div>
      </div>

      {customers === null ? (
        <SkeletonLines count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'No customers yet'}
          description={query ? 'Try a different search.' : 'Customers appear here once they book online, or you add a walk-in.'}
          action={!query ? <Button size="sm" onClick={openNew}>Add your first customer</Button> : undefined}
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Loyalty points</th>
                <th className="visually-hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c._id}>
                  <td className={styles.nameCell}>{c.name}</td>
                  <td>{c.email}</td>
                  <td className={styles.mono}>{c.phone}</td>
                  <td className={styles.mono}>{tenantId ? c.loyaltyPoints?.[tenantId] ?? 0 : '—'}</td>
                  <td>
                    <button className={styles.textButton} onClick={() => openEdit(c)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.editing ? 'Edit customer' : 'Add customer'}>
        <Input label="Name" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input
          label="Email"
          type="email"
          required
          disabled={!!modal.editing}
          hint={modal.editing ? "Email can't be changed here — it's how a customer's account is matched across salons." : undefined}
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Input label="Phone" required value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <Button fullWidth loading={saving} onClick={save} disabled={!form.name || !form.email || !form.phone}>
          {modal.editing ? 'Save changes' : 'Add customer'}
        </Button>
      </Modal>
    </div>
  );
}
