# Deployment Runbook — Vercel Default Domain

This app is deployed on Vercel's default `<project>.vercel.app` URL. There is
no custom domain, no wildcard subdomain, and no host-based routing — tenants
are addressed by path (`/t/[tenantSlug]`), platform admin lives at `/admin`,
and the root `/` is the public discovery/search surface.

(The previous `DOMAIN_SETUP_AND_CUTOVER.md` runbook described a
wildcard-subdomain deployment on a custom domain — that architecture was
replaced; this file supersedes it.)

## 0. Before the first real `npm install`

`react-leaflet@^4.2.1`'s peer dependencies target React 18, while this app
pins React 19. `package.json` carries an `overrides` entry pinning
`react-leaflet`'s peer check to the installed React/React-DOM versions as a
stopgap so `npm install` doesn't fail on the conflict. This hasn't been
verified against the real npm registry (no egress in the build sandbox) —
run a clean `npm install` once real registry access exists, and if it still
fails, fall back to `--legacy-peer-deps` or bump to `react-leaflet@^5.x`
(check `LocationPickerMap.tsx`/`DiscoveryMap.tsx`/`SalonMapView.tsx` against
v5's API first — some v4 patterns were dropped).

## 1. Environment Variables

Set in Vercel → Settings → Environment Variables (Production):
```
MONGODB_URI=<Atlas connection string>
BLOB_READ_WRITE_TOKEN=<Vercel Blob token>
NODE_ENV=production
EMAILJS_SERVICE_ID=<EmailJS service ID>
EMAILJS_TEMPLATE_ID=<EmailJS template ID>
EMAILJS_PUBLIC_KEY=<EmailJS public key>
EMAILJS_PRIVATE_KEY=<EmailJS private key>
```

The four `EMAILJS_*` vars send customer sign-in codes and staff setup codes
(src/lib/email.ts) via EmailJS — chosen over a domain-verified provider
(Resend) specifically because there's no domain to verify here (see the
banner at the top of this file): EmailJS sends through a real connected
email account instead of proving domain ownership. See `.env.local` for the
one-time EmailJS dashboard setup (Service, Template, keys).

Omitting any of the four is fully supported, not just a degraded fallback:
every flow that hands someone a code also displays it on-screen (the staff
setup-code panel, the customer sign-in modal outside production) for manual
copy/paste — so the app works end to end without EmailJS configured at all,
just without automatic email delivery.

No domain configuration is needed in Vercel → Settings → Domains.

## 2. Database Setup (run once, before first deploy traffic)

```
npm run db:init                                  # collections + indexes
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD=<strong password> \
  npm run db:create-super-admin                  # only way to get /admin working
```

## 3. Migrating existing Sanity data (skip if starting fresh)

```
MIGRATION_TENANT_SLUG=<slug> MIGRATION_TENANT_NAME="<name>" \
  ADMIN_EMAIL=<tenant admin email> ADMIN_PASSWORD=<tenant admin password> \
  npm run db:create-tenant

NEXT_PUBLIC_SANITY_PROJECT_ID=<id> SANITY_API_READ_TOKEN=<read-only token> \
  BLOB_READ_WRITE_TOKEN=<same token as step 1> npm run db:migrate
```
Check the printed summary — any skipped appointments (dangling references)
are logged individually above the summary line. After a successful
migration, remove `SANITY_API_READ_TOKEN` / `NEXT_PUBLIC_SANITY_*` from the
environment and drop `next-sanity` from `package.json`.

## 4. Smoke Test (on the live `*.vercel.app` URL)

- [ ] `/` loads, search returns a tenant
- [ ] `/t/<slug>` loads with correct branding from `siteSettings`
- [ ] `/t/<slug>/book` — public booking creates an appointment with no session
- [ ] `/t/<slug>/login` — staff login works; session cookie set
- [ ] Staff dashboard routes (services/categories/barbers/appointments CRUD)
      correctly scope to the logged-in tenant
- [ ] Attempting to PUT a document `_id` belonging to a different tenant
      returns 404, not a silent cross-tenant write
- [ ] `/admin/login` — super_admin login works
- [ ] `/admin` — tenant list loads, tenant creation via the form works
- [ ] Image upload requires admin auth and rejects >5MB / non-image files
- [ ] `/manifest.webmanifest`, `/admin/manifest.webmanifest`,
      `/t/<slug>/manifest.webmanifest` each return distinct, correct branding
- [ ] Logout, then confirm no stale authenticated page is served from the
      service worker cache
- [ ] Staff dashboard — services, barbers, customers, appointments,
      waitlist, analytics, and settings pages all load and correctly scope
      to the logged-in tenant
- [ ] Location picker + map render correctly on the tenant settings page
- [ ] Submitting a review against a completed appointment succeeds and the
      review appears on the tenant's public page
- [ ] Favoriting a salon from the discovery page persists and shows up
      correctly for the signed-in customer
- [ ] Customer sign-in code flow end-to-end: request code, receive it,
      verify it, land on "My Appointments" with the correct appointments
      scoped to that customer

## Customer-facing authentication

Resolved via the lightweight email-code claim flow — see `PROGRESS2.md`'s
Phase G notes and `customerAuth.ts`. Customers request a one-time code by
email, verify it, and get a claim session scoped to that email; no
password, no staff-session reuse.
