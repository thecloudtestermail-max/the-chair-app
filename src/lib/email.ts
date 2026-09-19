// src/lib/email.ts
//
// EmailJS instead of a domain-verified provider — with no domain to verify
// (see DEPLOY.md), EmailJS is the better fit: it sends through a real email
// account (e.g. Gmail) you connect in its dashboard, so there's no DNS
// ownership check to pass, and — unlike a sandbox sender — it can deliver
// to any real recipient, not just the account holder's own inbox.
//
// Requires one-time setup in the EmailJS dashboard (emailjs.com) that
// can't be done from code: a Service (your connected email account), a
// Template, and its keys. The template should read these params:
//   {{to_email}}  — recipient
//   {{subject}}   — email subject
//   {{code}}      — the OTP / setup code, on its own for easy display
//   {{message}}   — full HTML body (falls back to code-only templates if unused)
// Set EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, and
// (recommended — enables "strict mode" so only your server can send with
// this template) EMAILJS_PRIVATE_KEY in .env.local.
//
// Returns false — logging instead of sending — whenever those aren't all
// set, same shape as before switching providers. This is deliberately
// only a soft fallback here, not the primary UX for "email isn't
// configured": every caller that hands someone a code also displays it
// on-screen as the actual fallback — see dashboard/staff's setup-code
// panel and CustomerSignInModal's dev code — so a working install with no
// EmailJS credentials at all still functions end to end, just manually.
const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

export async function sendEmail({
  to,
  subject,
  html,
  code,
}: {
  to: string;
  subject: string;
  html: string;
  code?: string;
}): Promise<boolean> {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey) {
    console.log(`[email] EmailJS not configured — would have sent "${subject}" to ${to}`);
    return false;
  }

  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        accessToken: privateKey || undefined,
        template_params: {
          to_email: to,
          subject,
          message: html,
          code: code || '',
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[email] EmailJS error (${res.status}) sending "${subject}" to ${to}: ${text}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[email] EmailJS request failed sending "${subject}" to ${to}:`, error);
    return false;
  }
}
