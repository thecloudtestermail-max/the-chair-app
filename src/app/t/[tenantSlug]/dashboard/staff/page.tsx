// src/app/t/[tenantSlug]/dashboard/staff/page.tsx
//
// New surface — closes the gap flagged in the nav audit: there was no way
// for a tenant admin to give a receptionist or barber their own dashboard
// login at all, only the founding admin account existed (created by the
// platform super_admin at tenant setup). Deliberately doesn't offer an
// "admin" role option here — see api/staff/route.ts for why.
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import styles from './page.module.css';

interface StaffMember {
  _id: string;
  username: string;
  email: string;
  role: 'receptionist' | 'barber';
  barberId?: string;
  status: 'active' | 'invited';
}

interface BarberOption {
  _id: string;
  name: string;
}

const emptyForm = { name: '', email: '', role: 'receptionist' as 'receptionist' | 'barber', barberId: '' };

export default function StaffPage() {
  const role = useRole();
  const allowed = role === 'admin';
  const toast = useToast();

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [barbers, setBarbers] = useState<BarberOption[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [codePanel, setCodePanel] = useState<{ name: string; email: string; code: string; emailed: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => fetch('/api/staff').then((r) => (r.ok ? r.json() : [])).then(setStaff);

  useEffect(() => {
    if (!allowed) return;
    load();
    fetch('/api/barbers')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setBarbers(data.map((b: any) => ({ _id: b._id, name: b.name }))));
  }, [allowed]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Managing staff accounts is only available to admins." />;
  }

  const openNew = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const invite = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          role: form.role,
          barberId: form.role === 'barber' ? form.barberId || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModalOpen(false);
        setCodePanel({ name: form.name, email: form.email, code: data.inviteCode, emailed: !!data.emailed });
        load();
      } else {
        toast.show(data.message || 'Failed to add staff member', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const resend = async (s: StaffMember) => {
    setBusyId(s._id);
    try {
      const res = await fetch('/api/staff/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s._id }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodePanel({ name: s.username, email: s.email, code: data.inviteCode, emailed: !!data.emailed });
      } else {
        toast.show(data.message || 'Failed to regenerate code', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s: StaffMember) => {
    if (!confirm(`Remove ${s.username}'s staff access? This can't be undone.`)) return;
    setBusyId(s._id);
    try {
      const res = await fetch(`/api/staff?id=${s._id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.show('Staff member removed', 'success');
        load();
      } else {
        toast.show(data.message || 'Could not remove staff member', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = () => {
    if (!codePanel) return;
    navigator.clipboard?.writeText(codePanel.code).then(() => toast.show('Code copied', 'success'));
  };

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Staff</h1>
        <Button size="sm" onClick={openNew}>
          Add employee
        </Button>
      </div>

      {staff === null ? (
        <SkeletonLines count={3} />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff accounts yet"
          description="Give your receptionist or barbers their own dashboard login."
          action={<Button size="sm" onClick={openNew}>Add your first employee</Button>}
        />
      ) : (
        <div className={styles.list}>
          {staff.map((s) => (
            <div key={s._id} className={styles.row}>
              <div className={styles.rowBody}>
                <p className={styles.name}>{s.username}</p>
                <p className={styles.meta}>
                  {s.email} · <span className={styles.roleTag}>{s.role}</span>
                </p>
              </div>
              <Badge tone={s.status === 'active' ? 'confirmed' : 'pending'}>{s.status === 'active' ? 'Active' : 'Invited'}</Badge>
              <div className={styles.rowActions}>
                {s.status === 'invited' && (
                  <button className={styles.textButton} disabled={busyId === s._id} onClick={() => resend(s)}>
                    Show code
                  </button>
                )}
                <button className={styles.textButtonDanger} disabled={busyId === s._id} onClick={() => remove(s)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add employee">
        <Input label="Name" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'receptionist' | 'barber' }))}>
          <option value="receptionist">Receptionist</option>
          <option value="barber">Barber</option>
        </Select>
        {form.role === 'barber' && (
          <Select
            label="Linked barber profile"
            hint="Optional — links this login to an existing public barber profile."
            value={form.barberId}
            onChange={(e) => setForm((f) => ({ ...f, barberId: e.target.value }))}
          >
            <option value="">Not linked</option>
            {barbers.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Button fullWidth loading={saving} onClick={invite} disabled={!form.name || !form.email}>
          Create account &amp; get setup code
        </Button>
      </Modal>

      <Modal open={!!codePanel} onClose={() => setCodePanel(null)} title="Setup code">
        {codePanel && (
          <>
            {codePanel.emailed ? (
              <p className={styles.codeIntro}>
                We've emailed this to <strong>{codePanel.name}</strong> ({codePanel.email}). You can also copy it below and send it
                yourself.
              </p>
            ) : (
              <p className={styles.codeIntro}>
                Email isn't set up yet, so this hasn't been sent automatically — copy it and send it to <strong>{codePanel.name}</strong> (
                {codePanel.email}) yourself (text, Slack, in person, etc).
              </p>
            )}
            <div className={styles.codeBlock}>{codePanel.code}</div>
            <p className={styles.codeNote}>
              At the staff sign-in page they'll choose "Have a setup code?", enter it with their email, and set their own password. This
              code won't be shown again — but you can always generate a new one from "Show code".
            </p>
            <Button fullWidth onClick={copyCode}>
              Copy code
            </Button>
          </>
        )}
      </Modal>
    </div>
  );
}
