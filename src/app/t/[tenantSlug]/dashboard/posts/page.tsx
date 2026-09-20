// src/app/t/[tenantSlug]/dashboard/posts/page.tsx
//
// Part 3 — a barber's (or, for the tenant, an admin's) self-service feed of
// photo posts. Unlike dashboard/barbers/page.tsx, no EmptyState role-gate:
// both 'admin' and 'barber' are legitimately allowed here (see NAV_ITEMS in
// DashboardShell.tsx). Posts are create/delete-only, never edited, so a
// single inline form is enough — no add/edit Modal like the barbers page.
'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea, Select } from '@/components/ui/Field';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonLines } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRole } from '@/hooks/useRole';
import styles from './page.module.css';

interface Post {
  _id: string;
  barberId: string;
  barberName: string;
  imageUrl: string;
  caption?: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
}

interface BarberOption {
  _id: string;
  name: string;
}

export default function PostsPage() {
  const role = useRole();
  // A barber's session already ties every post to session.barberId — the
  // API only needs (and only accepts) a barberId in the request body when
  // an admin is posting, since an admin isn't any one barber and could be
  // posting on behalf of any of them.
  const needsBarberPicker = role === 'admin';
  const toast = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [barbers, setBarbers] = useState<BarberOption[] | null>(null);
  const [barberId, setBarberId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => fetch('/api/posts?mine=true').then((r) => (r.ok ? r.json() : [])).then(setPosts);
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!needsBarberPicker) return;
    fetch('/api/barbers')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BarberOption[]) => {
        setBarbers(data);
        if (data.length === 1) setBarberId(data[0]._id); // only one barber on staff — nothing to actually choose
      });
  }, [needsBarberPicker]);

  const canPost = Boolean(imageUrl) && (!needsBarberPicker || Boolean(barberId));

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, caption: caption || undefined, barberId: needsBarberPicker ? barberId : undefined }),
      });
      if (res.ok) {
        toast.show('Posted', 'success');
        setImageUrl('');
        setCaption('');
        load();
      } else {
        const data = await res.json();
        toast.show(data.message || 'Failed to post', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post: Post) => {
    if (!confirm('Delete this post?')) return;
    const res = await fetch(`/api/posts?_id=${post._id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      toast.show('Post deleted', 'success');
      load();
    } else {
      toast.show(data.message || 'Could not delete post', 'error');
    }
  };

  // An admin can't post at all with no barber on staff yet — the API has
  // nowhere to attribute the post to. Send them to add one instead of
  // showing a composer that will only ever fail.
  if (needsBarberPicker && barbers !== null && barbers.length === 0) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <h1 className={styles.heading}>Posts</h1>
        </div>
        <EmptyState
          title="Add a barber before posting"
          description="Posts are shown under a barber's profile, so at least one barber needs to exist on your team first."
        />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Posts</h1>
      </div>

      <div className={styles.composer}>
        {needsBarberPicker && barbers && barbers.length > 1 && (
          <Select label="Posting as" value={barberId} onChange={(e) => setBarberId(e.target.value)}>
            <option value="">Choose a barber…</option>
            {barbers.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <ImageUpload label="Photo" value={imageUrl} onChange={setImageUrl} />
        <Textarea label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        <Button loading={saving} disabled={!canPost} onClick={create}>
          Post
        </Button>
      </div>

      {posts === null ? (
        <SkeletonLines count={3} />
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" description="Share a photo of your work so customers can discover you on the main feed." />
      ) : (
        <div className={styles.grid}>
          {posts.map((p) => (
            <div key={p._id} className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt="" className={styles.image} />
              <div className={styles.cardBody}>
                {p.caption && <p className={styles.caption}>{p.caption}</p>}
                <p className={styles.meta}>
                  {p.likeCount} like{p.likeCount === 1 ? '' : 's'} · {p.commentCount} comment{p.commentCount === 1 ? '' : 's'}
                </p>
                <button className={styles.textButtonDanger} onClick={() => remove(p)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
