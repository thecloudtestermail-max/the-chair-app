// src/lib/welcomePdf/index.ts
//
// Builds the welcome PDF handed to every new user: page 1 has their sign-in,
// then a guide for their role, then one QR code per page. The password only
// ever exists in memory here: it is printed on page 1 and never stored,
// logged or written anywhere else. See lib/staffAuth.ts.
import { Doc } from './layout';
import { drawGuide, makeCtx, QR_PAGE_COUNT, WelcomePdfInput, WelcomeRole } from './content';
import { SITE_URL } from '../site';
import { SUPPORT_EMAIL } from '../support';

export type { WelcomePdfInput, WelcomeRole };

type Given = Omit<WelcomePdfInput, 'siteUrl' | 'supportEmail'> & Partial<Pick<WelcomePdfInput, 'siteUrl' | 'supportEmail'>>;

const ROLE_LABEL: Record<WelcomeRole, string> = { admin: 'Owner guide', receptionist: 'Reception guide', barber: 'Barber guide' };

async function render(input: WelcomePdfInput, qrFirstPage: number): Promise<{ bytes: Uint8Array; pages: number }> {
  const host = new URL(input.siteUrl).host;
  const doc = await Doc.create({
    title: `Welcome to ${input.salonName} - The Chair App ${ROLE_LABEL[input.role].toLowerCase()}`,
    author: 'The Chair App',
    subject: `Sign-in details and getting-started guide for ${input.salonName}`,
    headerRight: `${ROLE_LABEL[input.role]} for ${input.salonName}`,
    footerLeft: host,
    footerUrl: input.siteUrl,
    footerRightLabel: `${input.salonName}  |  ${ROLE_LABEL[input.role]}`,
  });
  drawGuide(doc, makeCtx(input, qrFirstPage));
  doc.stampChrome();
  return { bytes: await doc.pdf.save(), pages: doc.pages.length };
}

/**
 * Two passes: the first counts the pages, so page 1 can tell the reader
 * exactly which pages hold the QR codes (always the last three).
 */
export async function buildWelcomePdf(given: Given): Promise<Uint8Array> {
  const input: WelcomePdfInput = { ...given, siteUrl: given.siteUrl ?? SITE_URL, supportEmail: given.supportEmail ?? SUPPORT_EMAIL };
  const probe = await render(input, 99);
  const qrFirstPage = probe.pages - QR_PAGE_COUNT + 1;
  return (await render(input, qrFirstPage)).bytes;
}

/** Same, base64-encoded for JSON responses. */
export async function buildWelcomePdfBase64(given: Given): Promise<string> {
  return Buffer.from(await buildWelcomePdf(given)).toString('base64');
}
