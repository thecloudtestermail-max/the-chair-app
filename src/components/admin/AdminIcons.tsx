// src/components/admin/AdminIcons.tsx
//
// Same hand-drawn, 20x20 stroke-icon convention as
// src/components/dashboard/NavIcons.tsx (no icon library, one weight,
// matches the "ledger" aesthetic) — a few glyphs the tenant dashboard rail
// doesn't need: platform-wide tenants, moderation, other admins, and the
// audit trail. Reuses OverviewIcon, AnalyticsIcon, SettingsIcon,
// PublicPageIcon and LogoutIcon from NavIcons directly instead of
// redrawing them.
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

export const TenantsIcon = (p: IconProps) =>
  base(
    <>
      <path d="M3 17.5V8.2L10 3l7 5.2v9.3" />
      <path d="M7 17.5v-5h6v5" />
      <path d="M3 8.2h14" />
    </>,
    p
  );

export const StaffDirectoryIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="7" cy="6.5" r="2.5" />
      <circle cx="14" cy="6.5" r="2.2" />
      <path d="M2.3 16.5c.5-2.8 2.3-4.3 4.7-4.3s4.2 1.5 4.7 4.3" />
      <path d="M12.5 12.6c2 .2 3.5 1.6 4 3.9" />
    </>,
    p
  );

export const ModerationIcon = (p: IconProps) =>
  base(
    <>
      <path d="M10 2.5l6.5 2.6v4.8c0 4.2-2.7 7-6.5 7.6-3.8-.6-6.5-3.4-6.5-7.6V5.1z" />
      <path d="M7.5 10l1.8 1.8L13 8" />
    </>,
    p
  );

export const AdminsIcon = (p: IconProps) =>
  base(
    <>
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.5 17c.7-3.3 3.2-5 6.5-5s5.8 1.7 6.5 5" />
      <path d="M15.5 3.3l1 1 1.8-2" />
    </>,
    p
  );

export const AuditLogIcon = (p: IconProps) =>
  base(
    <>
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <path d="M7 6.5h6M7 9.5h6M7 12.5h3.5" />
    </>,
    p
  );

export const SecurityIcon = (p: IconProps) =>
  base(
    <>
      <path d="M10 2.5l6 2.2v4.4c0 3.9-2.5 6.6-6 7.4-3.5-.8-6-3.5-6-7.4V4.7z" />
      <rect x="7.3" y="8.7" width="5.4" height="4.3" rx="0.8" />
      <path d="M8.4 8.7V7.2a1.6 1.6 0 013.2 0v1.5" />
    </>,
    p
  );
