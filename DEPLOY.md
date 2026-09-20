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

Two dependencies were added for the welcome PDFs: `pdf-lib` (lays out the
PDF; pure JavaScript, uses only the built-in PDF fonts, so nothing to bundle)
and `qrcode` (+ `@types/qrcode`, computes the QR codes, which are then drawn as
vector shapes). They have not been installed or run against the real npm
registry from the build sandbox, so run `npm install` and then
`npx vitest run __tests__/welcome-pdf.test.ts` once.

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

The four `EMAILJS_*` vars are **optional** and only power convenience email:
password-reset links, "you've been added" notices to new team members, and
booking received/confirmed/cancelled emails to customers (src/lib/email.ts,
src/lib/notifications.ts). EmailJS was chosen over a domain-verified provider
(Resend) because there's no domain to verify here: it sends through a real
connected email account. See `.env.local` for the one-time EmailJS dashboard
setup (Service, Template, keys). The template should show `{{message}}` (the
full HTML body); a code-only template that shows `{{code}}` will display the
reset link itself.

**Nothing depends on email arriving.** Without EmailJS configured:
- a new team member's temporary password is shown to their admin on screen and
  printed in the welcome PDF (page 1);
- "Forgot password" does not pretend to send anything: it tells the person to
  email the support address (below), who resets it for them (see "Resetting a
  password by hand");
- booking emails are simply not sent.

Optional: `SUPPORT_EMAIL` (default `geehyness22@gmail.com`) is the address shown
to people who use "Forgot password" while email is not configured, and printed
in the welcome PDFs' help pages.

No domain configuration is needed in Vercel → Settings → Domains.

Optional: `NEXT_PUBLIC_SITE_URL` (default `https://the-chair-app.vercel.app`) is the
public address used by the global footer link, `sitemap.xml`, `robots.txt` and
page metadata. Set it only if the app moves to a custom domain.

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
- [ ] `/t/<slug>/login` — sign in with email + password works for the owner, a
      receptionist, a barber AND a customer; staff land on the dashboard, a
      customer on the salon page
- [ ] `/login` (The Chair App) — same form; staff are sent to their salon's dashboard
- [ ] Staff dashboard routes (services/categories/barbers/appointments CRUD)
      correctly scope to the logged-in tenant
- [ ] Attempting to PUT a document `_id` belonging to a different tenant
      returns 404, not a silent cross-tenant write
- [ ] `/admin/login` — super_admin login works (and the same credentials are
      REFUSED at `/login`)
- [ ] `/admin` — tenant list loads; creating a tenant offers **Download welcome
      PDF**; the owner can sign in with the password from page 1 and is forced
      to choose their own
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
- [ ] Customer flow end-to-end: **Create account** (name, email, phone,
      password), land signed in, see "My appointments" scoped to that
      customer, change details and password on **Account**, sign out
- [ ] Forgot password: with EmailJS configured, a reset link arrives and works
      once; without it, the dialog shows the support address
- [ ] Staff dashboard → **Staff** → Add a barber: a temporary password and
      **Download welcome PDF** appear; the barber signs in, is forced to
      choose a password, then sees only their own appointments
- [ ] Mark a booking **Completed**: the customer's loyalty points go up by the
      service price (whole dollars), once
- [ ] Suspend a tenant (`status: 'suspended'`): its staff are signed out
      immediately, and cannot sign in

## Authentication

Everyone except the platform admin signs in the same way: email + password at
`/t/<slug>/login` or `/login` (one form, `src/components/auth/SignInForm.tsx`,
one endpoint, `POST /api/auth/login`). The server works out who the person is;
staff go to their dashboard, customers stay put. The platform `super_admin`
has its own door, `/admin/login` (`POST /api/admin/login`), and is refused by
the public one.

- **Customers** register themselves (`POST /api/auth/register`). A customer
  record created by an earlier *guest booking* has no password and cannot be
  claimed by typing its email: that person uses **Forgot password** to set one.
- **Staff** are added by their salon admin (owner accounts by the platform
  admin). The app generates a **temporary password**, stores only its hash,
  and returns a welcome PDF once (never stored): sign-in details on page 1, a
  guide for the role, and one QR code per page at the end for printing. The
  temporary password expires after 7 days and must be replaced at first
  sign-in (until then the API refuses the session for everything else).
  **Reissue access** on the Staff page does it again for anyone locked out.
- One email = one password across every account it owns (a person's customer
  record and any staff roles, at any salon). Resets and password changes update
  them together.
- Sign-in, registration, reset and admin sign-in are throttled per
  (email + IP), per IP, and per email (`src/lib/rateLimit.ts`), so a stranger
  failing logins for someone's email can no longer lock that person out.

### Resetting a password by hand (no EmailJS)
When email isn't configured, "Forgot password" tells people to email the
support address. When one arrives **from the address on the account**:

```
MONGODB_URI=<production URI> RESET_EMAIL=person@example.com npm run db:reset-password
```
It gives every account that email owns (customer and/or staff, at any salon) a
new temporary password, ends their sessions, and prints the password once:
reply with it. Staff are made to choose their own at next sign-in; customers
can change theirs on **Account**. It never touches the platform admin, whose
password only changes via `npm run db:create-super-admin`. (A salon owner can
also fix a locked-out team member themselves with **Staff → Reissue access**.)

## One-off migration after deploying this version

```
npm run db:init                       # new indexes (passwordResets, loginAttempts, users.email)
MONGODB_URI=... npm run db:normalize-emails            # dry run: reports what would change
MONGODB_URI=... npm run db:normalize-emails -- --apply # lower-cases stored emails
```
Emails are now stored and matched lower-cased; accounts created earlier with
capital letters would otherwise not be found at sign-in. The old
`customerClaims` and `staffInvites` collections are no longer used and can be
dropped. Staff invited under the old setup-code flow have no password: use
**Reissue access** for them.
