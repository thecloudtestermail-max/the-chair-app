// src/components/PostCard.tsx
//
// Part 3 — a single stylist post in the social feed: photo, caption, like
// toggle, and an expand-to-comment section. requireSignIn is passed in from
// the parent (page-level useCustomerAuth() instance), same pattern as
// toggleFavorite in src/app/page.tsx — like/comment both replay after
// sign-in if the visitor wasn't already signed in.
'use client';
import { useState } from 'react';
import Link from 'next/link';
import styles from './PostCard.module.css';

export interface FeedPost {
  _id: string;
  tenantSlug: string;
  tenantName: string;
  barberId: string;
  barberName: string;
  barberSlug: string;
  barberImageUrl?: string;
  imageUrl: string;
  caption?: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isLikedByMe: boolean;
}

interface FeedComment {
  _id: string;
  customerId: string;
  customerName: string;
  text: string;
  createdAt: string;
}

export function PostCard({ post, requireSignIn }: { post: FeedPost; requireSignIn: (action: () => void) => void }) {
  const [liked, setLiked] = useState(post.isLikedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  const toggleLike = () => {
    requireSignIn(async () => {
      if (liked) {
        await fetch(`/api/likes?postId=${post._id}`, { method: 'DELETE' });
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        await fetch('/api/likes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post._id }),
        });
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    });
  };

  const loadComments = () => {
    setShowComments((v) => !v);
    if (comments === null) {
      fetch(`/api/comments?postId=${post._id}`)
        .then((r) => (r.ok ? r.json() : []))
        .then(setComments);
    }
  };

  const submitComment = () => {
    if (!commentText.trim()) return;
    requireSignIn(async () => {
      setPosting(true);
      try {
        const res = await fetch('/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post._id, text: commentText.trim() }),
        });
        if (res.ok) {
          const created = await res.json();
          setComments((prev) => [{ ...created, customerName: 'You' }, ...(prev || [])]);
          setCommentCount((c) => c + 1);
          setCommentText('');
        }
      } finally {
        setPosting(false);
      }
    });
  };

  return (
    <div className={styles.card}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.imageUrl} alt="" className={styles.image} />
      <div className={styles.body}>
        <div className={styles.header}>
          {post.barberImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.barberImageUrl} alt="" className={styles.avatar} />
          ) : (
            <div className={styles.avatarPlaceholder} aria-hidden="true">
              {post.barberName.charAt(0)}
            </div>
          )}
          <div>
            <Link href={`/t/${post.tenantSlug}/barbers/${post.barberSlug}`} className={styles.barberName}>
              {post.barberName}
            </Link>
            <p className={styles.tenantName}>at {post.tenantName}</p>
          </div>
        </div>

        {post.caption && <p className={styles.caption}>{post.caption}</p>}

        <div className={styles.actions}>
          <button
            className={styles.likeButton}
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            onClick={toggleLike}
          >
            {liked ? '♥' : '♡'} {likeCount}
          </button>
          <button className={styles.textButton} onClick={loadComments}>
            {commentCount} comment{commentCount === 1 ? '' : 's'}
          </button>
        </div>

        {showComments && (
          <div className={styles.comments}>
            {comments === null ? (
              <p className={styles.commentMeta}>Loading…</p>
            ) : (
              comments.map((c) => (
                <p key={c._id} className={styles.comment}>
                  <strong>{c.customerName}</strong> {c.text}
                </p>
              ))
            )}
            <div className={styles.commentForm}>
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment…"
                className={styles.commentInput}
                aria-label="Add a comment"
              />
              <button className={styles.textButton} onClick={submitComment} disabled={posting || !commentText.trim()}>
                Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
