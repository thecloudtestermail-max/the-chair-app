# Admin App PWA Setup Guide

## Overview

The admin app is now a **separate, standalone PWA** that can be deployed independently from the main Chair App. It communicates with the main app's backend API for authentication and data.

## Architecture

```
┌─────────────────────┐        ┌──────────────────────┐
│   Admin PWA         │        │   Main App           │
│  (admin-app/)       │◄──────►│  (src/)              │
│                     │  HTTP  │                      │
│ - Login page        │        │ - /api/admin/login   │
│ - Dashboard         │        │ - /api/platform/...  │
│ - Tenant mgmt       │        │ - Database           │
│                     │        │ - Auth               │
└─────────────────────┘        └──────────────────────┘
```

## Directory Structure

```
admin-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with PWA metadata
│   │   ├── globals.css          # Global styles
│   │   ├── manifest.ts          # PWA manifest generator
│   │   ├── login/
│   │   │   ├── page.tsx        # Login page
│   │   │   └── page.module.css
│   │   └── dashboard/
│   │       ├── page.tsx         # Dashboard (tenant list & create)
│   │       └── page.module.css
│   └── api/
│       └── auth/
│           └── login/           # Proxy to main app's API
├── public/                      # PWA icons
│   ├── admin-icon-192.png
│   ├── admin-icon-512.png
│   ├── admin-icon-512-maskable.png
│   └── favicon.ico
├── package.json
├── next.config.ts               # PWA configuration
├── tsconfig.json
└── README.md
```

## Deployment Options

### Option 1: Vercel (Recommended)

Create a separate Vercel project:

1. **Duplicate the GitHub repo** or use the same repo with subdirectory deployment
2. **New Vercel Project**
   - Import git repository
   - **Root Directory:** `admin-app`
   - **Framework:** Next.js
   - **Environment Variables:**
     - `NEXT_PUBLIC_API_BASE`: `https://chair.app` (or wherever main app is deployed)
3. **Deploy**

The admin app will be available at: `admin.chair.app` (or `admin-app.vercel.app`)

### Option 2: Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY admin-app .
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t chair-admin -f admin-app/Dockerfile .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_BASE=https://api.chair.app chair-admin
```

### Option 3: Self-hosted

```bash
cd admin-app
npm install
npm run build
NEXT_PUBLIC_API_BASE=https://api.chair.app npm start
```

Then set up a reverse proxy (nginx, Caddy, etc.):

```nginx
server {
    listen 80;
    server_name admin.chair.app;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 4: Subdomain Routing

If you want the admin app on a **subdomain** of the main app:

**With Vercel:**
- Main app: `chair.app` (deployment at `chair-app.vercel.app`)
- Admin app: `admin.chair.app` (deployment at `chair-admin.vercel.app`)
- Configure DNS to point `admin.chair.app` to `chair-admin.vercel.app`

**With self-hosted:**
```nginx
# Main app
server {
    listen 80;
    server_name chair.app www.chair.app;
    location / { proxy_pass http://localhost:3000; }
}

# Admin app
server {
    listen 80;
    server_name admin.chair.app;
    location / { proxy_pass http://localhost:3001; }
}
```

## API Integration

The admin app makes requests to:

- `POST /api/admin/login` – Authenticate (returns session cookie)
- `GET /api/platform/tenants` – List tenants
- `POST /api/platform/tenants` – Create tenant

These are implemented in the main app at:
- `src/app/api/admin/login/route.ts`
- `src/app/api/platform/tenants/route.ts`

**CORS Note:** If deployed on different origins (e.g., `admin.chair.app` vs `api.chair.app`), the main app may need CORS headers:

```typescript
// In main app's API routes
const headers = {
  'Access-Control-Allow-Origin': 'https://admin.chair.app',
  'Access-Control-Allow-Credentials': 'true',
};
```

However, if using the **same origin** (subpath), no CORS is needed:
- Main app: `https://chair.app`
- Admin app served from: `https://chair.app/admin` (no separate deployment needed)

## PWA Features

### Installation

Users can install the admin app as a native app:

**iOS:**
1. Safari → Share → Add to Home Screen

**Android:**
1. Chrome → Menu → Install app

**Desktop (Windows, Mac, Linux):**
1. Chrome/Edge → Install button in address bar
2. Or Menu → "Install Chair Admin"

### Offline Support

With the service worker:
- Login page is cached (users can enter credentials offline)
- Static assets are cached
- API calls gracefully fail if offline with a helpful message

### Shortcuts

Once installed, the app shows shortcuts:
- "View Tenants" → Opens dashboard
- "Create Tenant" → Opens dashboard with create form shown

## Development Workflow

### Running Both Apps Locally

```bash
# Terminal 1: Main app backend
cd chair-app-main
npm run dev

# Terminal 2: Admin app frontend
cd admin-app
npm run dev -- --port 3001
```

Then:
- Main app: http://localhost:3000
- Admin app: http://localhost:3001

The admin app will call `http://localhost:3000/api/...` for backend requests.

### Testing PWA Features Locally

In Chrome DevTools:
1. **Application** tab
2. **Service Workers** section – see registration
3. **Manifest** section – see app manifest
4. **Storage** section – see cached assets

To install locally:
1. Visit http://localhost:3001
2. Look for install button in address bar (Chrome)
3. Click "Install"

## Environment Variables

### Admin App (`admin-app/.env.local`)

```env
# Backend API base URL (where the main app is deployed)
# If admin-app and main app are on the same server, use relative paths:
NEXT_PUBLIC_API_BASE=http://localhost:3000
# Or for production:
NEXT_PUBLIC_API_BASE=https://api.chair.app
```

### Main App (existing)

No new environment variables needed. The admin app uses the existing:
- `MONGODB_URI`
- `EMAILJS_*`
- etc.

## Troubleshooting

### "API requests returning 401"
- Check that `NEXT_PUBLIC_API_BASE` points to the correct backend
- Verify the session cookie is being sent (check Network tab)

### "PWA won't install"
- Ensure HTTPS is enabled (PWA requires HTTPS in production)
- Check that manifest.json is valid
- Service worker must be registered

### "Logout doesn't work"
- Verify logout route clears the session cookie
- Check browser's Application > Cookies

### "Dark mode not working"
- CSS uses `@media (prefers-color-scheme: dark)`
- Test in system settings or browser dev tools

## Next Steps

1. **Deploy the admin app** to your chosen platform
2. **Point it at your main app's API** via `NEXT_PUBLIC_API_BASE`
3. **Install on your phone/desktop** to verify PWA features
4. **Share the URL** with platform admins

---

For questions, refer to:
- Next.js PWA guide: https://nextjs.org/docs
- next-pwa docs: https://ducanh-next-pwa.vercel.app/
- This repo's main README.md
