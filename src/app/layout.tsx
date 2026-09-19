import type { Metadata } from 'next';
import { fontVariables } from './fonts';
import { InstallPrompt } from '@/components/InstallPrompt';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { ToastProvider } from '@/components/ui/Toast';
import '../styles/tokens.css';

export const metadata: Metadata = {
  title: 'The Chair App',
  description: 'Salon and barbershop booking platform',
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
        <ToastProvider>{children}</ToastProvider>
        <InstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
