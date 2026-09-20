// src/app/t/[tenantSlug]/dashboard/staff/page.tsx
//
// Adding someone creates their account with a TEMPORARY password and gives
// the admin a welcome PDF to hand over (sign-in details on page 1, then a
// guide for their role). They sign in like everyone else, with email +
// password, and are made to choose their own. "Reissue access" does the same
// again for anyone who is locked out or forgot. Deliberately doesn't offer an
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
import { downloadBase64Pdf, pdfFilename } from '@/lib/downloadPdf';
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
  const [access, setAccess] = useState<{ name: string; email: string; tempPassword: string; expiresAt?: string; pdf: string | null; emailed: boolean } | null>(null);
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
        setAccess({ name: form.name, email: data.email, tempPassword: data.tempPassword, expiresAt: data.tempPasswordExpiresAt, pdf: data.welcomePdf, emailed: !!data.emailed });
        load();
      } else {
        toast.show(data.message || 'Failed to add staff member', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const resend = async (s: StaffMember) => {
    if (s.status === 'active' && !confirm(`Give ${s.username} a new temporary password? Their current password will stop working and they'll be signed out everywhere.`)) return;
    setBusyId(s._id);
    try {
      const res = await fetch('/api/staff/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s._id }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccess({ name: s.username, email: s.email, tempPassword: data.tempPassword, expiresAt: data.tempPasswordExpiresAt, pdf: data.welcomePdf, emailed: !!data.emailed });
        load();
      } else {
        toast.show(data.message || 'Failed to reissue access', 'error');
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

  const copyPassword = () => {
    if (!access) return;
    navigator.clipboard?.writeText(access.tempPassword).then(() => toast.show('Password copied', 'success'));
  };

  const downloadPdf = () => {
    if (access?.pdf) downloadBase64Pdf(access.pdf, pdfFilename('Welcome', access.name));
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
                <button className={styles.textButton} disabled={busyId === s._id} onClick={() => resend(s)}>
                  Reissue access
                </button>
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
            hint="A public profile is created for them automatically. Pick an existing one only if this person already has one."
            value={form.barberId}
            onChange={(e) => setForm((f) => ({ ...f, barberId: e.target.value }))}
          >
            <option value="">Create a new profile</option>
            {barbers.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Button fullWidth loading={saving} onClick={invite} disabled={!form.name || !form.email}>
          Create account &amp; get welcome guide
        </Button>
      </Modal>

      <Modal open={!!access} onClose={() => setAccess(null)} title="Welcome guide">
        {access && (
          <>
            <p className={styles.codeIntro}>
              <strong>{access.name}</strong> can sign in now with their email and the temporary password below. Download their welcome guide (sign-in details on page 1, then a guide for their role) and hand it over.
              {access.emailed ? ' We also emailed them where to sign in.' : ' Email isn\'t set up yet, so nothing was sent automatically.'}
            </p>
            <div className={styles.credRow}><span className={styles.credLabel}>Email</span><span className={styles.credValue}>{access.email}</span></div>
            <div className={styles.credRow}><span className={styles.credLabel}>Password</span><span className={styles.codeBlock}>{access.tempPassword}</span></div>
            <p className={styles.codeNote}>
              They'll be asked to choose their own password when they first sign in{access.expiresAt ? `; this one works until ${new Date(access.expiresAt).toLocaleDateString()}` : ''}. It is shown only now. If it is lost, use "Reissue access".
            </p>
            {access.pdf ? (
              <Button fullWidth onClick={downloadPdf}>Download welcome PDF</Button>
            ) : (
              <p className={styles.codeNote}>The PDF could not be generated this time. Use "Reissue access" to try again, or copy the password below.</p>
            )}
            <Button fullWidth variant="secondary" onClick={copyPassword}>Copy password</Button>
          </>
        )}
      </Modal>
    </div>
  );
}
