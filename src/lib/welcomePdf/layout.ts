// src/lib/welcomePdf/layout.ts
//
// A small flow-layout engine on top of pdf-lib: paragraphs with inline
// **bold**, bullets, checklists, tables, callouts and step cards, with
// automatic page breaks and a running header/footer stamped on every page
// once the total page count is known.
//
// Uses only the built-in PDF fonts (no font files to bundle, nothing fetched
// at runtime), so all text is passed through safeText() first: those fonts
// only cover the WinAnsi character set, and pdf-lib throws on anything else
// (for example a name containing a character outside Latin-1).
import { PDFDocument, PDFPage, PDFFont, PDFName, PDFString, PDFArray, StandardFonts, rgb, RGB } from 'pdf-lib';
import { drawQr } from './qr';

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;
export const MARGIN = 51; // 18mm
export const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = 62; // space reserved for the running header on inner pages
const BOTTOM = 62; // space reserved for the footer

const hex = (h: string): RGB => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
export const COLOR = {
  ink: hex('#14231c'), soft: hex('#3d4d43'), faint: hex('#5f6f65'), paper: hex('#f7f8f2'), line: hex('#c9c2ac'),
  pine: hex('#1f3b2e'), brass: hex('#b8873b'), brassS: hex('#96692a'), brassBg: hex('#f6ecd6'),
  rust: hex('#a23e32'), rustBg: hex('#f7e6e3'), moss: hex('#4c6b4f'), mossBg: hex('#e6eee6'), white: rgb(1, 1, 1),
  sand: hex('#e9d9b8'), mist: hex('#dfe6d8'),
};

// ---------------------------------------------------------------- text safety
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const REPLACE: Record<string, string> = { '\u2192': '->', '\u2190': '<-', '\u2713': 'v', '\u00a0': ' ', '\u2011': '-', '\u202f': ' ', '\u2009': ' ', '\u200b': '',
  // Letters that don't decompose into base + accent, so the generic fallback would turn them into "?"
  '\u0141': 'L', '\u0142': 'l', '\u0110': 'D', '\u0111': 'd', '\u0131': 'i', '\u0126': 'H', '\u0127': 'h' };

export function safeText(input: string): string {
  let out = '';
  for (const ch of String(input).normalize('NFC')) {
    if (ch in REPLACE) { out += REPLACE[ch]; continue; }
    const code = ch.codePointAt(0)!;
    if (code === 9 || code === 10 || code === 13) { out += ' '; continue; }
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(code)) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
  }
  return out;
}

// ---------------------------------------------------------------- rich text
interface Tok { t: string; bold: boolean }
type Line = Tok[];

function tokens(text: string): Tok[] {
  const out: Tok[] = [];
  safeText(text).split('**').forEach((seg, i) => {
    seg.split(/(\s+)/).forEach((part) => { if (part) out.push({ t: part, bold: i % 2 === 1 }); });
  });
  return out;
}

export interface Fonts { reg: PDFFont; bold: PDFFont; serif: PDFFont; mono: PDFFont; monoBold: PDFFont; italic: PDFFont }

export class Doc {
  pdf!: PDFDocument;
  fonts!: Fonts;
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0; // distance from the top of the current page
  private headerRight = '';
  private footerLeft = '';
  private footerUrl = '';
  private footerRight = '';
  private innerFromPage = 2;

  static async create(opts: { title: string; author: string; subject: string; headerRight: string; footerLeft: string; footerUrl: string; footerRightLabel: string }): Promise<Doc> {
    const d = new Doc();
    d.pdf = await PDFDocument.create();
    d.pdf.setTitle(safeText(opts.title));
    d.pdf.setAuthor(safeText(opts.author));
    d.pdf.setSubject(safeText(opts.subject));
    d.pdf.setCreator('The Chair App');
    d.pdf.setProducer('The Chair App');
    d.pdf.setLanguage('en');
    d.fonts = {
      reg: await d.pdf.embedFont(StandardFonts.Helvetica),
      bold: await d.pdf.embedFont(StandardFonts.HelveticaBold),
      serif: await d.pdf.embedFont(StandardFonts.TimesRomanBold),
      mono: await d.pdf.embedFont(StandardFonts.Courier),
      monoBold: await d.pdf.embedFont(StandardFonts.CourierBold),
      italic: await d.pdf.embedFont(StandardFonts.HelveticaOblique),
    };
    d.headerRight = safeText(opts.headerRight);
    d.footerLeft = safeText(opts.footerLeft);
    d.footerUrl = opts.footerUrl;
    d.footerRight = safeText(opts.footerRightLabel);
    return d;
  }

  // ------------------------------------------------------------ pages
  newPage(): PDFPage {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = this.pages.length === 1 ? 0 : TOP;
    return this.page;
  }

  get pageNo() { return this.pages.length; }
  get room() { return PAGE_H - BOTTOM - this.y; }
  ensure(h: number) { if (this.room < h) this.newPage(); }
  space(h: number) { this.y += h; }
  private py(y: number) { return PAGE_H - y; }

  // ------------------------------------------------------------ primitives
  private width(t: Tok, size: number) { return (t.bold ? this.fonts.bold : this.fonts.reg).widthOfTextAtSize(t.t, size); }

  wrap(text: string, size: number, maxW: number): Line[] {
    const lines: Line[] = [];
    let line: Line = [];
    let w = 0;
    const flush = () => {
      while (line.length && /^\s+$/.test(line[line.length - 1].t)) line.pop();
      if (line.length) lines.push(line);
      line = []; w = 0;
    };
    for (const tok of tokens(text)) {
      const tw = this.width(tok, size);
      if (/^\s+$/.test(tok.t)) { if (line.length) { line.push(tok); w += tw; } continue; }
      if (tw > maxW) { // a single word longer than the column (a URL): break it by characters
        flush();
        let chunk = '';
        for (const ch of tok.t) {
          if (this.width({ t: chunk + ch, bold: tok.bold }, size) > maxW && chunk) { lines.push([{ t: chunk, bold: tok.bold }]); chunk = ch; } else chunk += ch;
        }
        if (chunk) { line = [{ t: chunk, bold: tok.bold }]; w = this.width(line[0], size); }
        continue;
      }
      if (w + tw > maxW && line.length) flush();
      line.push(tok); w += tw;
    }
    flush();
    return lines.length ? lines : [[]];
  }

  private drawLine(line: Line, x: number, y: number, size: number, color: RGB, page = this.page) {
    let cx = x;
    for (const tok of line) {
      const font = tok.bold ? this.fonts.bold : this.fonts.reg;
      if (tok.t.trim()) page.drawText(tok.t, { x: cx, y: this.py(y + size), size, font, color });
      cx += font.widthOfTextAtSize(tok.t, size);
    }
  }

  textHeight(text: string, size: number, maxW: number, lead = 1.42) { return this.wrap(text, size, maxW).length * size * lead; }

  /** Draws wrapped rich text at (x, y-from-top) without touching the cursor. Returns its height. */
  textAt(text: string, x: number, y: number, maxW: number, size: number, color: RGB = COLOR.soft, lead = 1.42): number {
    const lines = this.wrap(text, size, maxW);
    lines.forEach((l, i) => this.drawLine(l, x, y + i * size * lead, size, color));
    return lines.length * size * lead;
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: RGB; border?: RGB; bw?: number; dash?: number[] } = {}) {
    this.page.drawRectangle({ x, y: this.py(y + h), width: w, height: h, color: o.fill, borderColor: o.border, borderWidth: o.border ? o.bw ?? 1 : 0, borderDashArray: o.dash });
  }

  hline(x1: number, x2: number, y: number, color: RGB, thickness = 0.8, page = this.page) {
    page.drawLine({ start: { x: x1, y: this.py(y) }, end: { x: x2, y: this.py(y) }, thickness, color });
  }

  link(url: string, x: number, y: number, w: number, h: number, page = this.page) {
    const ref = this.pdf.context.register(this.pdf.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, this.py(y + h), x + w, this.py(y)], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }));
    const existing = page.node.lookup(PDFName.of('Annots'));
    if (existing instanceof PDFArray) existing.push(ref);
    else page.node.set(PDFName.of('Annots'), this.pdf.context.obj([ref]));
  }

  // ------------------------------------------------------------ blocks
  kicker(t: string) {
    this.ensure(60);
    this.page.drawText(safeText(t.toUpperCase()), { x: MARGIN, y: this.py(this.y + 9), size: 8.5, font: this.fonts.bold, color: COLOR.brassS });
    this.y += 16;
  }

  h1(t: string) {
    this.ensure(50);
    this.page.drawText(safeText(t), { x: MARGIN, y: this.py(this.y + 24), size: 25, font: this.fonts.serif, color: COLOR.pine });
    this.y += 32;
    this.hline(MARGIN, MARGIN + CONTENT_W, this.y, COLOR.brass, 2);
    this.y += 10;
  }

  title(kick: string, t: string, intro?: string) {
    this.kicker(kick); this.h1(t);
    if (intro) this.lead(intro);
  }

  lead(t: string) { this.para(t, { size: 11.5, color: COLOR.ink, after: 8 }); }

  h2(t: string) {
    this.ensure(46);
    this.y += 8;
    this.page.drawText(safeText(t), { x: MARGIN, y: this.py(this.y + 14), size: 14.5, font: this.fonts.serif, color: COLOR.pine });
    this.y += 24;
  }

  para(t: string, o: { size?: number; color?: RGB; after?: number; x?: number; w?: number } = {}) {
    const size = o.size ?? 10;
    const x = o.x ?? MARGIN; const w = o.w ?? CONTENT_W - (x - MARGIN);
    const lines = this.wrap(t, size, w);
    const lh = size * 1.42;
    // Keep at least two lines together, then flow line by line.
    this.ensure(Math.min(lines.length, 2) * lh);
    for (const l of lines) {
      this.ensure(lh);
      this.drawLine(l, x, this.y, size, o.color ?? COLOR.soft);
      this.y += lh;
    }
    this.y += o.after ?? 6;
  }

  bullets(items: string[], o: { check?: boolean; size?: number } = {}) {
    const size = o.size ?? 10;
    for (const it of items) {
      const lines = this.wrap(it, size, CONTENT_W - 16);
      const lh = size * 1.42;
      this.ensure(Math.min(lines.length, 2) * lh);
      const startY = this.y;
      if (o.check) this.rect(MARGIN + 1, this.y + 1.5, 7.5, 7.5, { border: COLOR.brassS, bw: 1 });
      else this.page.drawCircle({ x: MARGIN + 4, y: this.py(this.y + size * 0.62), size: 1.7, color: COLOR.brassS });
      lines.forEach((l, i) => { if (i > 0) this.ensure(lh); this.drawLine(l, MARGIN + 16, this.y, size, COLOR.soft); this.y += lh; });
      void startY;
      this.y += 2.5;
    }
    this.y += 3;
  }

  callout(tone: 'brass' | 'rust' | 'moss', title: string | null, text: string) {
    const [bar, bg] = tone === 'rust' ? [COLOR.rust, COLOR.rustBg] : tone === 'moss' ? [COLOR.moss, COLOR.mossBg] : [COLOR.brass, COLOR.brassBg];
    const pad = 9; const x = MARGIN; const inner = CONTENT_W - 4 - pad * 2;
    const th = title ? this.textHeight(`**${title}**`, 10.5, inner) + 2 : 0;
    const bh = this.textHeight(text, 9.8, inner);
    const h = th + bh + pad * 2;
    this.ensure(h + 8);
    this.rect(x, this.y, CONTENT_W, h, { fill: bg });
    this.rect(x, this.y, 4, h, { fill: bar });
    let cy = this.y + pad;
    if (title) { this.textAt(`**${title}**`, x + 4 + pad, cy, inner, 10.5, COLOR.ink); cy += th; }
    this.textAt(text, x + 4 + pad, cy, inner, 9.8, COLOR.soft);
    this.y += h + 9;
  }

  /** A numbered card with bullets or checkboxes inside. */
  card(n: number | string, title: string, items: string[], o: { check?: boolean } = {}) {
    const pad = 10; const left = 46; const w = CONTENT_W;
    const size = 9.8; const lh = size * 1.42; const innerW = w - left - pad;
    const itemLines = items.map((it) => this.wrap(it, size, innerW - 14));
    const h = pad + 20 + itemLines.reduce((s, l) => s + l.length * lh + 2.5, 0) + pad - 2;
    this.ensure(h + 10);
    const top = this.y;
    this.rect(MARGIN, top, w, h, { fill: COLOR.paper, border: COLOR.line, bw: 0.9 });
    this.rect(MARGIN + 9, top + 9, 26, 26, { border: COLOR.brass, bw: 1.2, dash: [3, 2.5] });
    const label = String(n);
    this.page.drawText(label, { x: MARGIN + 22 - this.fonts.monoBold.widthOfTextAtSize(label, 12) / 2, y: this.py(top + 27), size: 12, font: this.fonts.monoBold, color: COLOR.brassS });
    this.page.drawText(safeText(title), { x: MARGIN + left, y: this.py(top + pad + 12), size: 13, font: this.fonts.serif, color: COLOR.pine });
    let cy = top + pad + 24;
    itemLines.forEach((lines) => {
      if (o.check) this.rect(MARGIN + left + 1, cy + 1.5, 7.5, 7.5, { border: COLOR.brassS, bw: 1 });
      else this.page.drawCircle({ x: MARGIN + left + 4, y: this.py(cy + size * 0.62), size: 1.7, color: COLOR.brassS });
      lines.forEach((l, i) => this.drawLine(l, MARGIN + left + 14, cy + i * lh, size, COLOR.soft));
      cy += lines.length * lh + 2.5;
    });
    this.y = top + h + 9;
  }

  table(head: string[], rows: string[][], widths: number[], o: { size?: number; boldFirst?: boolean; linkCol?: number; linkUrls?: string[] } = {}) {
    const size = o.size ?? 9.2; const lh = size * 1.4; const padX = 6; const padY = 4.5;
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = CONTENT_W / total;
    const cols = widths.map((x) => x * scale);
    const drawHead = () => {
      const hh = 8.6 * 1.4 + padY * 2;
      this.ensure(hh + 20);
      this.rect(MARGIN, this.y, CONTENT_W, hh, { fill: COLOR.pine });
      let cx = MARGIN;
      head.forEach((h, i) => { this.page.drawText(safeText(h.toUpperCase()), { x: cx + padX, y: this.py(this.y + padY + 8.6), size: 8.2, font: this.fonts.bold, color: COLOR.white }); cx += cols[i]; });
      this.y += hh;
    };
    drawHead();
    rows.forEach((r, ri) => {
      const cellLines = r.map((c, i) => this.wrap(i === 0 && o.boldFirst !== false ? `**${c}**` : c, size, cols[i] - padX * 2));
      const rh = Math.max(...cellLines.map((l) => l.length)) * lh + padY * 2;
      if (this.room < rh) { this.newPage(); drawHead(); }
      if (ri % 2 === 1) this.rect(MARGIN, this.y, CONTENT_W, rh, { fill: COLOR.paper });
      let cx = MARGIN;
      cellLines.forEach((lines, i) => {
        const isLink = o.linkCol === i && Boolean(o.linkUrls?.[ri]);
        lines.forEach((l, k) => this.drawLine(l, cx + padX, this.y + padY + k * lh, size, isLink ? COLOR.brassS : i === 0 ? COLOR.ink : COLOR.soft));
        if (isLink) this.link(o.linkUrls![ri], cx + padX, this.y + padY, cols[i] - padX * 2, lines.length * lh);
        cx += cols[i];
      });
      this.hline(MARGIN, MARGIN + CONTENT_W, this.y + rh, COLOR.line, 0.5);
      this.y += rh;
    });
    this.hline(MARGIN, MARGIN + CONTENT_W, this.y, COLOR.line, 0.9);
    this.y += 12;
  }

  // ------------------------------------------------------------ chrome
  /** Stamps the running header and footer (with the discovery link) on every page. */
  stampChrome() {
    const total = this.pages.length;
    this.pages.forEach((page, idx) => {
      const n = idx + 1;
      this.hline(MARGIN, PAGE_W - MARGIN, PAGE_H - 43, COLOR.line, 0.8, page);
      page.drawText('The Chair App', { x: MARGIN, y: 30, size: 8.6, font: this.fonts.bold, color: COLOR.pine });
      const x = MARGIN + this.fonts.bold.widthOfTextAtSize('The Chair App', 8.6) + 8;
      const label = this.footerLeft;
      page.drawText(label, { x, y: 30, size: 8.6, font: this.fonts.bold, color: COLOR.brassS });
      const lw = this.fonts.bold.widthOfTextAtSize(label, 8.6);
      page.drawLine({ start: { x, y: 28.2 }, end: { x: x + lw, y: 28.2 }, thickness: 0.6, color: COLOR.brassS });
      this.link(this.footerUrl, x - 2, PAGE_H - 34, lw + 4, 13, page);
      const right = safeText(`${this.footerRight}  |  Page ${n} of ${total}`);
      page.drawText(right, { x: PAGE_W - MARGIN - this.fonts.reg.widthOfTextAtSize(right, 8.2), y: 30, size: 8.2, font: this.fonts.reg, color: COLOR.faint });
      page.drawText(safeText(`Find salons and book appointments at ${label}`), { x: MARGIN, y: 17, size: 7.4, font: this.fonts.italic, color: COLOR.faint });
      if (n >= this.innerFromPage) {
        page.drawText('THE CHAIR APP', { x: MARGIN, y: PAGE_H - 34, size: 8.2, font: this.fonts.bold, color: COLOR.pine });
        const hr = this.headerRight;
        page.drawText(hr, { x: PAGE_W - MARGIN - this.fonts.reg.widthOfTextAtSize(hr, 8.2), y: PAGE_H - 34, size: 8.2, font: this.fonts.reg, color: COLOR.faint });
        this.hline(MARGIN, PAGE_W - MARGIN, 51, COLOR.line, 0.6, page);
      }
    });
  }

  // ------------------------------------------------------------ QR page
  /** A page holding only one QR code, big, so it can be printed by itself. */
  qrPage(o: { salon: string; heading: string; sub: string; url: string; display: string; note: string; matrix: { size: number; get: (r: number, c: number) => boolean } }) {
    this.newPage();
    const cx = PAGE_W / 2;
    const center = (t: string, y: number, size: number, font: PDFFont, color: RGB) => {
      const s = safeText(t);
      this.page.drawText(s, { x: cx - font.widthOfTextAtSize(s, size) / 2, y: this.py(y + size), size, font, color });
    };
    center(o.salon.toUpperCase(), 92, 11, this.fonts.bold, COLOR.brassS);
    const headLines = this.wrap(`**${o.heading}**`, 30, CONTENT_W);
    let y = 112;
    headLines.forEach((l) => {
      const text = l.map((t) => t.t).join('');
      center(text, y, 30, this.fonts.serif, COLOR.pine);
      y += 36;
    });
    const sub = this.wrap(o.sub, 13, CONTENT_W - 60);
    sub.forEach((l) => { center(l.map((t) => t.t).join(''), y + 4, 13, this.fonts.reg, COLOR.soft); y += 19; });
    const size = 300; const qx = cx - size / 2; const qy = y + 26;
    this.rect(qx - 18, qy - 18, size + 36, size + 36, { fill: COLOR.white, border: COLOR.line, bw: 1 });
    drawQr(this.page, o.matrix, qx, this.py(qy + size), size);
    center(o.display, qy + size + 34, 13, this.fonts.monoBold, COLOR.ink);
    this.link(o.url, cx - 170, qy + size + 30, 340, 20);
    center(o.note, qy + size + 62, 10.5, this.fonts.italic, COLOR.faint);
  }
}
