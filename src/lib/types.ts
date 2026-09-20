// src/lib/types.ts
import { ObjectId } from 'mongodb';

export interface Tenant {
  _id?: ObjectId;
  slug: string;
  name: string;
  branding: {
    logoUrl?: string;
    primaryColor: string;
    secondaryColor?: string;
    font?: 'display' | 'classic' | 'modern';
  };
  // ISO 4217 code (see lib/currency.ts). Defaults to 'ZAR' for new tenants;
  // read paths fall back to DEFAULT_CURRENCY for tenants created before
  // this field existed, so it's typed as required here without a migration
  // being strictly necessary — but see scripts/backfill-tenant-currency.ts.
  currency: string;
  contactEmail: string;
  status: 'active' | 'suspended';
  createdAt: Date;
}

export interface User {
  _id?: ObjectId;
  tenantId?: ObjectId; // absent for super_admin — every other role requires it
  username: string;
  email: string;
  // Every staff account has a password. A newly added receptionist/barber
  // (and a salon owner created by the platform admin) starts with a
  // TEMPORARY one, printed once in their welcome PDF, and must replace it
  // at first sign-in (mustChangePassword). '' only exists on legacy accounts
  // that were invited under the old setup-code flow; they can't sign in until
  // an admin reissues access.
  passwordHash: string;
  role: 'super_admin' | 'admin' | 'receptionist' | 'barber';
  barberId?: ObjectId;
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: Date;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  welcomeIssuedAt?: Date;
  createdAt: Date;
}

export interface Barber {
  _id?: ObjectId;
  tenantId: ObjectId;
  name: string;
  slug: string;
  imageUrl?: string;
  bio?: string;
  portfolio?: string[]; // gallery image URLs
  tags?: string[]; // specialties, e.g. "Fades", "Beard sculpting"
  dailyAvailability: DailyAvailability[];
}

export interface DailyAvailability {
  dayOfWeek: number; // 0-6, Sunday-Saturday
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface Service {
  _id?: ObjectId;
  tenantId: ObjectId;
  categoryId?: ObjectId;
  name: string;
  duration: number; // minutes
  price: number;
  description?: string;
  imageUrl?: string;
}

export interface Category {
  _id?: ObjectId;
  tenantId: ObjectId;
  name: string;
  imageUrl?: string;
}

export interface Customer {
  _id?: ObjectId;
  name: string;
  email: string;
  phone: string;
  // Set for registered accounts. Customers created implicitly by a guest
  // booking have none until they set one (via "Forgot password").
  passwordHash?: string;
  passwordChangedAt?: Date;
  loyaltyPoints: {
    [tenantId: string]: number;
  };
  createdAt: Date;
}

export interface Appointment {
  _id?: ObjectId;
  tenantId: ObjectId;
  customerId: ObjectId;
  barberId: ObjectId;
  serviceId: ObjectId;
  dateTime: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'waitlist';
  source?: 'online' | 'walk-in'; // walk-in: staff-added, usually paired with status 'waitlist'
  notes?: string;
  // Set once points have been credited for this visit, so re-saving the
  // same status can never award them twice.
  loyaltyAwarded?: boolean;
  log: AppointmentLog[];
}

export interface AppointmentLog {
  timestamp: Date;
  action: string;
  changedBy: string;
}

export interface SiteSettings {
  _id?: ObjectId;
  tenantId: ObjectId;
  title: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  phone?: string;
  email?: string;
  location?: TenantLocation;
  socialLinks?: SocialLink[];
}

// Schema change (Part 2, Phase B — flagged per your instructions): location
// was a free-text string; the map feature needs coordinates. `address` is
// kept as the human-readable label; `lat`/`lng` come from either the admin
// dragging the map pin or the Nominatim geocode-search fallback.
export interface TenantLocation {
  address: string;
  lat: number;
  lng: number;
}

export interface SocialLink {
  platform: string;
  url: string;
}

// New in Part 2 — a review left against a specific completed appointment,
// so it can't be forged for a visit that never happened. `customerEmail` is
// kept alongside `customerId` because customers aren't fully authenticated
// (see the customer-claim-token notes in PROGRESS2.md) — the appointment
// link is the real authenticity check.
export interface Review {
  _id?: ObjectId;
  tenantId: ObjectId;
  barberId?: ObjectId;
  customerId: ObjectId;
  appointmentId: ObjectId;
  rating: number; // 1-5
  text?: string;
  status: 'visible' | 'flagged';
  createdAt: Date;
}

// New in Part 2 — a customer favoriting a salon on the discovery surface.
export interface Favorite {
  _id?: ObjectId;
  customerId: ObjectId;
  tenantId: ObjectId;
  createdAt: Date;
}

// The long-lived cookie-backed token issued when a customer signs in with
// email + password. Kept in its own collection, separate from staff
// `sessions` (which carry a role and are read by requireRole): a customer
// token only ever resolves to a customerId and unlocks no staff route.
export interface CustomerClaimSession {
  _id?: ObjectId;
  tokenHash: string;
  customerId: ObjectId;
  expiresAt: Date;
}

// One-hour, single-use link that lets someone choose a new password when
// they have proved they control the email (see lib/passwordReset.ts). It is
// keyed by email because one email = one password across every account it
// owns (customer and any staff roles).
export interface PasswordReset {
  _id?: ObjectId;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Session {
  _id?: ObjectId;
  tokenHash: string;
  subjectId: ObjectId;
  subjectType: 'user' | 'customer';
  tenantId?: ObjectId;
  barberId?: ObjectId; // set only when subjectType==='user' && role==='barber'
  role: string;
  // Copied from the user at sign-in. While true, requireRole rejects the
  // session everywhere except the change-password route.
  mustChangePassword?: boolean;
  expiresAt: Date;
}

// New in Part 3 — a stylist's post to the cross-tenant social feed. Photo is
// mandatory (this is a portfolio-style discoverability feature); caption is
// optional. barberId is the sole ownership key — a barber-role session's
// own posts are exactly { barberId: session.barberId }. tenantId is
// denormalized from the barber at creation time so tenant-scoped admin
// queries (delete/list) don't need a join back through barbers.
export interface Post {
  _id?: ObjectId;
  tenantId: ObjectId;
  barberId: ObjectId;
  imageUrl: string;
  caption?: string;
  createdAt: Date;
}

// New in Part 3 — a customer's like on a post. Pure toggle, closest analog
// is Favorite (customerId+tenantId unique pair) — here customerId+postId.
export interface Like {
  _id?: ObjectId;
  postId: ObjectId;
  customerId: ObjectId;
  createdAt: Date;
}

// New in Part 3 — a customer's comment on a post. tenantId is denormalized
// from the post at write time so a barber can moderate comments on their
// own posts, and an admin can moderate any comment in their tenant, without
// a lookup on every check.
export interface Comment {
  _id?: ObjectId;
  postId: ObjectId;
  tenantId: ObjectId;
  customerId: ObjectId;
  text: string;
  createdAt: Date;
}

// New in Part 3 — a customer following a stylist. Same toggle shape as
// Favorite, just barberId instead of tenantId.
export interface Follow {
  _id?: ObjectId;
  customerId: ObjectId;
  barberId: ObjectId;
  createdAt: Date;
}

export interface LoginAttempt {
  _id?: ObjectId;
  scope: 'login' | 'forgot' | 'register' | 'reset' | 'admin';
  email: string;
  ip: string;
  createdAt: Date;
}

// New — platform-admin accountability trail. Every mutating action a
// super_admin takes through /admin (tenant created/edited/suspended, staff
// password reissued, another admin added/removed, a review moderated)
// writes one row here. `meta` is a small, action-specific snapshot (e.g.
// { tenantName, from: 'active', to: 'suspended' }) — enough to show a
// readable log line without a join back to records that may since have
// changed or been deleted.
export interface AuditLogEntry {
  _id?: ObjectId;
  actorId: ObjectId;
  actorEmail: string;
  action: string;
  targetType: 'tenant' | 'staff' | 'admin' | 'review' | 'post' | 'comment' | 'session';
  targetId?: ObjectId;
  meta?: Record<string, unknown>;
  createdAt: Date;
}
