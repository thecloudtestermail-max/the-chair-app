// src/components/dashboard/NavIcons.tsx
//
// Minimal line icons for the dashboard sidebar's mobile icon-only rail (see
// DashboardShell.tsx) — no icon library is installed, and pulling one in
// for ten glyphs would be a heavier dependency than hand-drawing them.
// 20x20, stroke-based, one weight, matching the app's understated "ledger"
// aesthetic rather than a filled/branded icon set.
import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1" />
    </>,
    p
  );

export const AppointmentsIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="3.5" width="15" height="14" rx="1.5" />
      <path d="M2.5 8h15M6.5 2v3M13.5 2v3" />
    </>,
    p
  );

export const PostsIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="3" width="15" height="14" rx="1.5" />
      <circle cx="7" cy="8" r="1.4" />
      <path d="M2.5 14l4-3.5 3 2.5 3.5-4L17.5 14" />
    </>,
    p
  );

export const WaitlistIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5V10l3.2 2" />
    </>,
    p
  );

export const ServicesIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="14" r="2.5" />
      <path d="M17.5 3.5L4 15.5M8.3 8.3L17.5 16.5" />
    </>,
    p
  );

export const BarbersIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="6.5" r="3.5" />
      <path d="M3 17c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>,
    p
  );

export const CustomersIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="7.5" cy="7" r="3" />
      <path d="M1.8 16.5c0-3 2.6-5 5.7-5s5.7 2 5.7 5" />
      <path d="M13 4.3c1.5.3 2.7 1.5 2.7 3s-1.2 2.7-2.7 3M18.2 16.5c0-2.5-1.9-4.3-4.3-4.8" />
    </>,
    p
  );

export const StaffIcon = (p: IconProps) =>
  base(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <circle cx="7.3" cy="8.6" r="2" />
      <path d="M4.3 14.2c.4-1.7 1.7-2.6 3-2.6s2.6.9 3 2.6" />
      <path d="M12.5 7.5h4M12.5 10.5h4" />
    </>,
    p
  );

export const ReviewsIcon = (p: IconProps) =>
  base(<path d="M10 2.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.5l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76z" />, p);

export const AnalyticsIcon = (p: IconProps) =>
  base(
    <>
      <path d="M3 17V8M9.5 17V3M16 17v-6" />
      <path d="M2.5 17h15" />
    </>,
    p
  );

export const SettingsIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3L4.9 4.9" />
    </>,
    p
  );

export const AccountIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="7" r="3.2" />
      <path d="M3.5 17c.8-3.1 3.3-4.8 6.5-4.8s5.7 1.7 6.5 4.8" />
    </>,
    p
  );

export const PublicPageIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M2.5 10h15M10 2.5c2 2.2 3 5 3 7.5s-1 5.3-3 7.5c-2-2.2-3-5-3-7.5s1-5.3 3-7.5z" />
    </>,
    p
  );

export const LogoutIcon = (p: IconProps) =>
  base(
    <>
      <path d="M8 17.5H4a1.5 1.5 0 01-1.5-1.5V4A1.5 1.5 0 014 2.5h4" />
      <path d="M13 14l4-4-4-4M17 10H7.5" />
    </>,
    p
  );
