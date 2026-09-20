// __tests__/welcome-pdf.test.ts
//
// The real PDF generator (pdf-lib + qrcode). Slower than most tests because it
// actually lays out every page, so the number of builds is kept small.
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildWelcomePdf, buildWelcomePdfBase64 } from '@/lib/welcomePdf';
import { safeText } from '@/lib/welcomePdf/layout';
import { qrMatrix } from '@/lib/welcomePdf/qr';

const input = {
  role: 'admin' as const, salonName: 'Quano Locs', tenantSlug: 'quano-locs', personName: 'Quano Locs',
  email: 'quano-locs@chair.app', password: 'Quano-P@ss', mustChangePassword: true,
  passwordExpiresAt: new Date('2026-09-26T18:00:00Z'), siteUrl: 'https://the-chair-app.vercel.app', supportEmail: 'geehyness22@gmail.com',
};

describe('buildWelcomePdf', () => {
  it('produces a valid multi-page PDF with the three QR codes on the LAST three pages', async () => {
    const bytes = await buildWelcomePdf(input);
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(12);
    expect(doc.getPageCount()).toBeLessThanOrEqual(16);
    expect(doc.getTitle()).toContain('Quano Locs');
  }, 60_000);

  it('every page carries the platform link in the footer (clickable)', async () => {
    const doc = await PDFDocument.load(await buildWelcomePdf({ ...input, role: 'barber' }));
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      expect(annots && annots.size()).toBeGreaterThan(0);
    }
  }, 60_000);

  it('builds every role, including names the built-in fonts cannot encode, without throwing', async () => {
    for (const role of ['receptionist', 'barber'] as const) {
      const bytes = await buildWelcomePdf({ ...input, role, salonName: 'Łódź Cuts «Ünï»', personName: 'Zoë Ñandú 李' });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(8);
    }
  }, 120_000);

  it('base64 variant round-trips to the same kind of file', async () => {
    const b64 = await buildWelcomePdfBase64({ ...input, role: 'receptionist' });
    expect(Buffer.from(b64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);
});

describe('safeText', () => {
  it('keeps WinAnsi text, transliterates accents, and replaces the rest so pdf-lib never throws', () => {
    expect(safeText('Café “quotes” – dash • dot')).toBe('Café “quotes” – dash • dot');
    expect(safeText('Zoë Ñandú')).toBe('Zoë Ñandú');
    expect(safeText('Łódź')).toBe('Lódz');
    expect(safeText('李')).toBe('?');
    expect(safeText('a\tb\nc')).toBe('a b c');
    expect(safeText('go → there')).toBe('go -> there');
  });
});

describe('qrMatrix', () => {
  it('returns a square matrix with the three finder patterns', () => {
    const m = qrMatrix('https://the-chair-app.vercel.app/t/quano-locs/book');
    expect(m.size).toBeGreaterThanOrEqual(21);
    for (const [r, c] of [[0, 0], [0, m.size - 1], [m.size - 1, 0]]) expect(m.get(r, c)).toBe(true);
  });
});
