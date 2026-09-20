// src/lib/notifications.ts
//
// Booking emails to customers. Best-effort by design: a mail failure (or no
// mail provider at all) must never fail a booking or a status change, so
// this swallows every error and just reports whether anything was sent.
import { isEmailConfigured, sendEmail } from './email';
import { escapeHtml } from './text';
import { SITE_URL } from './site';

export type BookingEmailKind = 'received' | 'confirmed' | 'cancelled';

const COPY: Record<BookingEmailKind, { subject: (salon: string) => string; lead: string }> = {
  received: {
    subject: (salon) => `We've received your booking at ${salon}`,
    lead: "We've received your booking. It's <strong>pending</strong> until the salon confirms it. We'll email you again when it does.",
  },
  confirmed: {
    subject: (salon) => `Your booking at ${salon} is confirmed`,
    lead: 'Good news: your booking is <strong>confirmed</strong>.',
  },
  cancelled: {
    subject: (salon) => `Your booking at ${salon} was cancelled`,
    lead: 'Your booking was <strong>cancelled</strong>. You can book another time whenever you like.',
  },
};

export async function sendBookingEmail(p: {
  kind: BookingEmailKind;
  to: string;
  customerName: string;
  salonName: string;
  tenantSlug: string;
  serviceName?: string;
  barberName?: string;
  dateTime: Date;
}): Promise<boolean> {
  if (!isEmailConfigured() || !p.to) return false;
  try {
    const when = p.dateTime.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    const copy = COPY[p.kind];
    const details = [p.serviceName, p.barberName ? `with ${p.barberName}` : '', when].filter(Boolean).map((t) => escapeHtml(t as string)).join(' · ');
    return await sendEmail({
      to: p.to,
      subject: copy.subject(p.salonName),
      html:
        `<p>Hi ${escapeHtml(p.customerName)},</p><p>${copy.lead}</p>` +
        `<p style="font-weight:600">${escapeHtml(p.salonName)}<br/>${details}</p>` +
        `<p><a href="${SITE_URL}/t/${p.tenantSlug}/appointments">View your appointments</a></p>`,
    });
  } catch {
    return false;
  }
}
