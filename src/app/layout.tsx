import type { Metadata } from 'next';
import { fontVariables } from './fonts';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { ToastProvider } from '@/components/ui/Toast';
import { SiteFooter } from '@/components/SiteFooter';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import '../styles/tokens.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description: 'Salon and barbershop booking platform',
  // No og:url or canonical here on purpose: they would be inherited by every
  // salon page and point them all at the home page.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: 'Discover and book appointments at top salons and barbershops.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'The Chair App',
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1f3b2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>
        <div className="app-root">
          <ToastProvider>{children}</ToastProvider>
        </div>
        <SiteFooter />
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
