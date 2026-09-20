// src/app/t/[tenantSlug]/dashboard/services/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import { useCurrency } from '@/hooks/useCurrency';
import { formatPrice, currencySymbol } from '@/lib/currency';
import styles from './page.module.css';

interface Category {
  _id: string;
  name: string;
  imageUrl?: string;
}

interface Service {
  _id: string;
  name: string;
  duration: number;
  price: number;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  eligibleBarberIds?: string[];
}

interface BarberOption {
  _id: string;
  name: string;
  tags?: string[];
}

const emptyCategoryForm = { name: '', imageUrl: '' };
const emptyServiceForm = { name: '', duration: '30', price: '', description: '', imageUrl: '', categoryId: '', eligibleBarberIds: [] as string[] };

export default function ServicesPage() {
  const role = useRole();
  const allowed = role === 'admin';
  const toast = useToast();
  const currency = useCurrency();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [barbers, setBarbers] = useState<BarberOption[]>([]);

  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: Category }>({ open: false });
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [savingCategory, setSavingCategory] = useState(false);

  const [serviceModal, setServiceModal] = useState<{ open: boolean; editing?: Service }>({ open: false });
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [savingService, setSavingService] = useState(false);

  const load = () => {
    fetch('/api/categories').then((r) => (r.ok ? r.json() : [])).then(setCategories);
    fetch('/api/services').then((r) => (r.ok ? r.json() : [])).then(setServices);
    fetch('/api/barbers').then((r) => (r.ok ? r.json() : [])).then(setBarbers);
  };

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  if (!allowed) {
    return <EmptyState title="You don't have access to this page" description="Managing services is only available to admins." />;
  }

  // --- Categories ---
  const openNewCategory = () => {
    setCategoryForm(emptyCategoryForm);
    setCategoryModal({ open: true });
  };
  const openEditCategory = (c: Category) => {
    setCategoryForm({ name: c.name, imageUrl: c.imageUrl || '' });
    setCategoryModal({ open: true, editing: c });
  };
  const saveCategory = async () => {
    setSavingCategory(true);
    try {
      const editing = categoryModal.editing;
      const res = await fetch('/api/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { _id: editing._id, ...categoryForm } : categoryForm),
      });
      if (res.ok) {
        toast.show(editing ? 'Category updated' : 'Category added', 'success');
        setCategoryModal({ open: false });
        load();
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to save category', 'error');
      }
    } finally {
      setSavingCategory(false);
    }
  };
  const deleteCategory = async (c: Category) => {
    if (!confirm(`Delete category "${c.name}"?`)) return;
    const res = await fetch(`/api/categories?id=${c._id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast.show('Category deleted', 'success');
      load();
    } else {
      toast.show(data.message || 'Could not delete category', 'error');
    }
  };

  // --- Services ---
  const openNewService = () => {
    setServiceForm(emptyServiceForm);
    setServiceModal({ open: true });
  };
  const openEditService = (s: Service) => {
    setServiceForm({
      name: s.name,
      duration: String(s.duration),
      price: String(s.price),
      description: s.description || '',
      imageUrl: s.imageUrl || '',
      categoryId: s.categoryId || '',
      eligibleBarberIds: s.eligibleBarberIds || [],
    });
    setServiceModal({ open: true, editing: s });
  };
  const saveService = async () => {
    setSavingService(true);
    try {
      const editing = serviceModal.editing;
      const payload = {
        name: serviceForm.name,
        duration: parseInt(serviceForm.duration, 10),
        price: parseFloat(serviceForm.price),
        description: serviceForm.description || undefined,
        imageUrl: serviceForm.imageUrl || undefined,
        categoryId: serviceForm.categoryId || undefined,
        eligibleBarberIds: serviceForm.eligibleBarberIds,
      };
      const res = await fetch('/api/services', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { _id: editing._id, ...payload } : payload),
      });
      if (res.ok) {
        toast.show(editing ? 'Service updated' : 'Service added', 'success');
        setServiceModal({ open: false });
        load();
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to save service', 'error');
      }
    } finally {
      setSavingService(false);
    }
  };
  const deleteService = async (s: Service) => {
    if (!confirm(`Delete service "${s.name}"?`)) return;
    const res = await fetch(`/api/services?id=${s._id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast.show('Service deleted', 'success');
      load();
    } else {
      toast.show(data.message || 'Could not delete service', 'error');
    }
  };

  const categoryName = (id?: string) => categories?.find((c) => c._id === id)?.name;

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Services & categories</h1>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Categories</h2>
          <Button size="sm" onClick={openNewCategory}>
            Add category
          </Button>
        </div>
        {categories === null ? (
          <SkeletonLines count={2} />
        ) : categories.length === 0 ? (
          <EmptyState title="No categories yet" description="Group your services — e.g. Haircuts, Beard care, Color — so customers can browse by kind." action={<Button size="sm" onClick={openNewCategory}>Add your first category</Button>} />
        ) : (
          <div className={styles.categoryGrid}>
            {categories.map((c) => (
              <div key={c._id} className={styles.categoryCard}>
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" className={styles.categoryImage} />
                ) : (
                  <div className={styles.categoryImagePlaceholder} aria-hidden="true" />
                )}
                <div className={styles.categoryBody}>
                  <p className={styles.categoryName}>{c.name}</p>
                  <div className={styles.rowActions}>
                    <button className={styles.textButton} onClick={() => openEditCategory(c)}>
                      Edit
                    </button>
                    <Button variant="danger" size="sm" onClick={() => deleteCategory(c)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Services</h2>
          <Button size="sm" onClick={openNewService}>
            Add service
          </Button>
        </div>
        {services === null ? (
          <SkeletonLines count={3} />
        ) : services.length === 0 ? (
          <EmptyState title="No services yet" description="Add what you offer — haircuts, beard trims, color — with price and duration." action={<Button size="sm" onClick={openNewService}>Add your first service</Button>} />
        ) : (
          <div className={styles.serviceList}>
            {services.map((s) => (
              <div key={s._id} className={styles.serviceRow}>
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className={styles.serviceImage} />
                ) : (
                  <div className={styles.serviceImagePlaceholder} aria-hidden="true" />
                )}
                <div className={styles.serviceBody}>
                  <p className={styles.serviceName}>{s.name}</p>
                  <p className={styles.serviceMeta}>
                    <span className={styles.mono}>{formatPrice(s.price, currency)}</span> · {s.duration} min
                    {categoryName(s.categoryId) && <> · {categoryName(s.categoryId)}</>}
                  </p>
                  <p className={styles.serviceEligibility}>
                    {s.eligibleBarberIds && s.eligibleBarberIds.length > 0
                      ? `${s.eligibleBarberIds.length} of ${barbers.length} team member${barbers.length === 1 ? '' : 's'}`
                      : 'Open to anyone on staff'}
                  </p>
                </div>
                <div className={styles.rowActions}>
                  <button className={styles.textButton} onClick={() => openEditService(s)}>
                    Edit
                  </button>
                  <Button variant="danger" size="sm" onClick={() => deleteService(s)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={categoryModal.open} onClose={() => setCategoryModal({ open: false })} title={categoryModal.editing ? 'Edit category' : 'Add category'}>
        <Input label="Name" required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} />
        <ImageUpload label="Image" value={categoryForm.imageUrl} onChange={(url) => setCategoryForm({ ...categoryForm, imageUrl: url })} />
        <Button fullWidth loading={savingCategory} onClick={saveCategory} disabled={!categoryForm.name}>
          Save category
        </Button>
      </Modal>

      <Modal open={serviceModal.open} onClose={() => setServiceModal({ open: false })} title={serviceModal.editing ? 'Edit service' : 'Add service'}>
        <Input label="Name" required value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} />
        <div className={styles.formRow}>
          <Input label={`Price (${currencySymbol(currency)})`} required type="number" min="0" step="0.01" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} />
          <Input label="Duration (min)" required type="number" min="5" step="5" value={serviceForm.duration} onChange={(e) => setServiceForm({ ...serviceForm, duration: e.target.value })} />
        </div>
        <Select label="Category" value={serviceForm.categoryId} onChange={(e) => setServiceForm({ ...serviceForm, categoryId: e.target.value })}>
          <option value="">No category</option>
          {categories?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Textarea label="Description" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
        <ImageUpload label="Image" value={serviceForm.imageUrl} onChange={(url) => setServiceForm({ ...serviceForm, imageUrl: url })} />

        {barbers.length > 0 && (
          <div className={styles.eligibilityField}>
            <span className={styles.eligibilityLabel}>Who can perform this service</span>
            <p className={styles.eligibilityHint}>
              Leave everyone unchecked to allow any team member. Check specific people for a service only some of your
              team offers — e.g. a manicure only your nail technicians do. (Each person's specialties are set on their
              profile under Barbers.)
            </p>
            <div className={styles.eligibilityList}>
              {barbers.map((b) => {
                const checked = serviceForm.eligibleBarberIds.includes(b._id);
                return (
                  <label key={b._id} className={styles.eligibilityRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setServiceForm((f) => ({
                          ...f,
                          eligibleBarberIds: e.target.checked
                            ? [...f.eligibleBarberIds, b._id]
                            : f.eligibleBarberIds.filter((id) => id !== b._id),
                        }))
                      }
                    />
                    <span>
                      {b.name}
                      {b.tags && b.tags.length > 0 && <span className={styles.eligibilityTags}> · {b.tags.join(', ')}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <Button fullWidth loading={savingService} onClick={saveService} disabled={!serviceForm.name || !serviceForm.price}>
          Save service
        </Button>
      </Modal>
    </div>
  );
}
