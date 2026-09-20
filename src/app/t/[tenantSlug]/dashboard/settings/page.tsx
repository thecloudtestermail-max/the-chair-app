// src/app/t/[tenantSlug]/dashboard/settings/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { LocationPicker } from '@/components/dashboard/LocationPicker';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/currency';
import styles from './page.module.css';

interface SettingsState {
  title: string;
  description: string;
  logoUrl: string;
  coverImageUrl: string;
  phone: string;
  email: string;
  location: { address: string; lat: number; lng: number };
}

interface BrandingState {
  primaryColor: string;
  secondaryColor: string;
  font: 'display' | 'classic' | 'modern';
}

const DEFAULT_LOCATION = { address: '', lat: 40.7128, lng: -74.006 }; // NYC fallback center

export default function SettingsPage() {
  const role = useRole();
  const allowed = role === 'admin';
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({
    title: '',
    description: '',
    logoUrl: '',
    coverImageUrl: '',
    phone: '',
    email: '',
    location: DEFAULT_LOCATION,
  });
  const [branding, setBranding] = useState<BrandingState>({ primaryColor: '#2563eb', secondaryColor: '#1e3a8a', font: 'modern' });
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    fetch('/api/tenant/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.settings) {
          setSettings({
            title: data.settings.title || '',
            description: data.settings.description || '',
            logoUrl: data.settings.logoUrl || '',
            coverImageUrl: data.settings.coverImageUrl || '',
            phone: data.settings.phone || '',
            email: data.settings.email || '',
            location: data.settings.location || DEFAULT_LOCATION,
          });
        }
        if (data?.tenant?.branding) {
          setBranding({
            primaryColor: data.tenant.branding.primaryColor || '#2563eb',
            secondaryColor: data.tenant.branding.secondaryColor || '#1e3a8a',
            font: data.tenant.branding.font || 'modern',
          });
        }
        setCurrency(data?.tenant?.currency || DEFAULT_CURRENCY);
        setLoaded(true);
      });
  }, [allowed]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Settings is only available to admins." />;
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/tenant/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, branding, currency }),
      });
      if (res.ok) {
        toast.show('Settings saved', 'success');
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to save', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <SkeletonLines count={8} />;

  return (
    <div>
      <h1 className={styles.heading}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Business info</h2>
        <Input label="Business name" value={settings.title} onChange={(e) => setSettings({ ...settings, title: e.target.value })} />
        <Textarea label="Description" value={settings.description} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
        <div className={styles.formRow}>
          <Input label="Phone" value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
          <Input label="Email" type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Branding</h2>
        <div className={styles.formRow}>
          <div className={styles.colorField}>
            <label className={styles.colorLabel}>
              Primary color
              <input type="color" value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })} className={styles.colorInput} />
            </label>
          </div>
          <div className={styles.colorField}>
            <label className={styles.colorLabel}>
              Secondary color
              <input type="color" value={branding.secondaryColor} onChange={(e) => setBranding({ ...branding, secondaryColor: e.target.value })} className={styles.colorInput} />
            </label>
          </div>
        </div>
        <Select label="Typeface style" value={branding.font} onChange={(e) => setBranding({ ...branding, font: e.target.value as BrandingState['font'] })}>
          <option value="modern">Modern sans-serif</option>
          <option value="display">Warm serif</option>
          <option value="classic">Classic serif</option>
        </Select>
        <ImageUpload label="Logo" value={settings.logoUrl} onChange={(url) => setSettings({ ...settings, logoUrl: url })} />
        <ImageUpload label="Cover image" value={settings.coverImageUrl} onChange={(url) => setSettings({ ...settings, coverImageUrl: url })} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pricing</h2>
        <Select
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          hint="What your services are priced and paid in — shown to customers when booking, and on your dashboard and reports."
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Location</h2>
        <LocationPicker value={settings.location} onChange={(location) => setSettings({ ...settings, location })} />
      </section>

      <Button loading={saving} onClick={save}>
        Save settings
      </Button>
    </div>
  );
}
