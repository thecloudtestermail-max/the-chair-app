// src/lib/welcomePdf/content.ts
//
// What each role's welcome guide says. Page 1 is the ONLY page that carries
// credentials; everything after it is safe to hand around. The QR codes each
// get a page of their own at the end so they can be printed one at a time.
// Only describes what the app really does: where a feature isn't built, the
// guide says so instead of promising it.
import { Doc, COLOR, CONTENT_W, MARGIN, PAGE_H, PAGE_W, safeText } from './layout';
import { qrMatrix } from './qr';

export type WelcomeRole = 'admin' | 'receptionist' | 'barber';

export interface WelcomePdfInput {
  role: WelcomeRole;
  salonName: string;
  tenantSlug: string;
  personName?: string;
  email: string;
  password: string;
  /** True when the password is temporary and must be replaced at first sign-in. */
  mustChangePassword: boolean;
  passwordExpiresAt?: Date;
  issuedBy?: string;
  siteUrl: string;
  supportEmail: string;
}

const ROLE_LABEL: Record<WelcomeRole, string> = { admin: 'Salon owner', receptionist: 'Receptionist', barber: 'Barber' };
const QR_PAGES = 3;

interface Ctx extends WelcomePdfInput {
  host: string;
  urls: { login: string; dashboard: string; salon: string; book: string; appointments: string; discover: string };
  qrFirstPage: number;
}

export function makeCtx(input: WelcomePdfInput, qrFirstPage: number): Ctx {
  const base = input.siteUrl.replace(/\/+$/, '');
  const host = new URL(base).host;
  const t = `${base}/t/${input.tenantSlug}`;
  return {
    ...input, host, qrFirstPage,
    urls: { login: `${t}/login`, dashboard: `${t}/dashboard`, salon: t, book: `${t}/book`, appointments: `${t}/appointments`, discover: base },
  };
}

// ============================================================ page 1
function accessPage(d: Doc, c: Ctx) {
  d.newPage();
  const p = d.page;
  const py = (y: number) => PAGE_H - y;
  const band = 176;
  d.rect(0, 0, PAGE_W, band, { fill: COLOR.pine });
  d.rect(0, band, PAGE_W, 6, { fill: COLOR.brass });
  d.rect(MARGIN, 42, 30, 30, { border: COLOR.mist, bw: 1.2, dash: [3, 2.5] });
  p.drawText('#', { x: MARGIN + 11, y: py(63), size: 16, font: d.fonts.monoBold, color: COLOR.paper });
  p.drawText('The Chair App', { x: MARGIN + 42, y: py(56), size: 14, font: d.fonts.serif, color: COLOR.white });
  p.drawText(safeText(`${ROLE_LABEL[c.role].toUpperCase()} WELCOME PACK`), { x: MARGIN + 42, y: py(68), size: 8.6, font: d.fonts.bold, color: COLOR.sand });
  const title = safeText(`Welcome to ${c.salonName}`);
  const tsize = d.fonts.serif.widthOfTextAtSize(title, 30) > CONTENT_W ? 22 : 30;
  p.drawText(title, { x: MARGIN, y: py(118), size: tsize, font: d.fonts.serif, color: COLOR.white });
  p.drawText('Your sign-in details are below. The pages after this one get you started.', { x: MARGIN, y: py(145), size: 11.5, font: d.fonts.reg, color: COLOR.mist });

  d.y = band + 24;
  // private chip
  d.rect(MARGIN, d.y, 214, 18, { fill: COLOR.rustBg, border: COLOR.rust, bw: 1 });
  p.drawText('PRIVATE  |  CONTAINS YOUR SIGN-IN', { x: MARGIN + 9, y: py(d.y + 12.5), size: 8.4, font: d.fonts.bold, color: COLOR.rust });
  d.y += 30;

  const first = (c.personName || '').trim().split(/\s+/)[0];
  d.para(first ? `**Hi ${first}, here's how to get in.**` : "**Here's how to get in.**", { size: 12, color: COLOR.ink, after: 8 });

  // credentials box
  const rows: Array<[string, string, 'url' | 'mono' | 'big' | 'text']> = [
    ['SIGN IN AT', `${c.host}/t/${c.tenantSlug}/login`, 'url'],
    ['EMAIL', c.email, 'mono'],
    ['PASSWORD', c.password, 'big'],
  ];
  if (c.mustChangePassword && c.passwordExpiresAt) rows.push(['VALID UNTIL', fmtDate(c.passwordExpiresAt), 'text']);
  rows.push(['YOUR ROLE', ROLE_LABEL[c.role] + (c.role === 'admin' ? '. Full access to everything.' : ''), 'text']);
  const rh = 34; const bh = rows.length * rh;
  d.rect(MARGIN, d.y, CONTENT_W, bh, { fill: COLOR.brassBg, border: COLOR.brass, bw: 1.4, dash: [5, 3] });
  rows.forEach(([label, value, kind], i) => {
    const ry = d.y + i * rh;
    if (i > 0) d.hline(MARGIN + 6, MARGIN + CONTENT_W - 6, ry, hexLine(), 0.5);
    p.drawText(label, { x: MARGIN + 14, y: py(ry + 21), size: 8, font: d.fonts.bold, color: COLOR.faint });
    const x = MARGIN + 118; const avail = CONTENT_W - 118 - 12;
    const font = kind === 'text' ? d.fonts.bold : d.fonts.monoBold;
    let size = kind === 'big' ? 16 : kind === 'url' ? 9.5 : kind === 'text' ? 10 : 12.5;
    const v = safeText(value);
    while (font.widthOfTextAtSize(v, size) > avail && size > 6) size -= 0.5;
    p.drawText(v, { x, y: py(ry + 22), size, font, color: kind === 'url' ? COLOR.brassS : COLOR.ink });
    if (kind === 'url') d.link(c.urls.login, x, ry + 8, font.widthOfTextAtSize(v, size), 18);
  });
  d.y += bh + 8;
  d.para('Type the email and password exactly as shown. The password is case-sensitive.', { size: 8.8, color: COLOR.faint, after: 10 });

  // three steps
  d.h2('Three steps to your dashboard');
  const colW = (CONTENT_W - 24) / 3;
  const steps = [
    ['1', '**Open** the sign-in page: type the address above, or scan the Sign-in QR on page ' + c.qrFirstPage + '.'],
    ['2', '**Enter** your email and password, then tap **Sign in**.'],
    ['3', c.mustChangePassword ? "**Choose your own password.** You'll be asked to straight away. Then you're in." : "**You're in.** You land in your dashboard."],
  ];
  let maxH = 0;
  steps.forEach(([n, t], i) => {
    const x = MARGIN + i * (colW + 12);
    d.rect(x, d.y, 22, 22, { border: COLOR.brass, bw: 1.2, dash: [2.5, 2] });
    p.drawText(n, { x: x + 7.5, y: py(d.y + 16), size: 11, font: d.fonts.monoBold, color: COLOR.brassS });
    const h = d.textAt(t, x + 30, d.y + 1, colW - 30, 9.4, COLOR.soft);
    maxH = Math.max(maxH, h, 24);
  });
  d.y += maxH + 12;

  d.callout('rust', 'Keep this page private',
    "Anyone who has this page can sign in as you. Save your password in a password manager, then delete or shred this page. Every page after this one contains no sign-in details, so you can share them.");
  d.callout('brass', 'Forgot your password or locked out?',
    `Tap **Forgot password** on the sign-in screen. If email is set up for your salon you'll get a reset link. If not, email **${c.supportEmail}** from the address on your account and your password will be reset for you.`);

  d.para(`**Printing?** The QR codes are on pages ${c.qrFirstPage} to ${c.qrFirstPage + QR_PAGES - 1}, one per page, so you can print only the ones you want. Keep this page for yourself.`, { size: 9.4 });
}

const hexLine = () => COLOR.line;
function fmtDate(dt: Date) { return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }

// ============================================================ shared sections
function getStarted(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Start here', 'Get started in 5 minutes', 'Do these in order and you are working in minutes.');
  d.space(4);
  const signInBullets = [
    `Open your sign-in page (${c.host}/t/${c.tenantSlug}/login) and enter your email and password.`,
    ...(c.mustChangePassword ? ['You will be asked to **choose your own password** the first time. Pick one only you know.'] : []),
    'You land in your dashboard. The menu is your whole toolbox: the next pages explain every item.',
  ];
  if (c.role === 'admin') {
    d.card(1, 'Sign in and look around', signInBullets);
    d.card(2, 'Open your hours, then add a service', [
      'Go to **Barbers** and edit the profile named **' + c.salonName + '**. Under **Weekly availability**, switch on the days you work and set start and end times. Save.',
      'Go to **Services** and add at least one service with a name, duration (minutes) and price.',
      '**Until both are done, customers will see "No open times".** This is the number one reason a new salon cannot take bookings.',
    ]);
    d.card(3, 'Try it yourself, then share it', [
      'Tap **View public page** (bottom of the menu): that is exactly what customers see.',
      'Make a test booking with your own email, then find it under **Appointments**.',
      'Print the Book online QR (see the QR pages at the end) and send your link to three regulars today.',
    ]);
    d.callout('brass', 'Why hours come first', `When your salon was created, The Chair App added a starter profile with your salon's name so you can be listed immediately. It has no working hours yet, and the booking screen only offers times a barber is genuinely free. Set hours once and the calendar fills itself in 15-minute steps.`);
  } else if (c.role === 'receptionist') {
    d.card(1, 'Sign in and look around', signInBullets);
    d.card(2, "Learn the three screens you'll use all day", [
      '**Appointments**: every booking, filtered by date and status. Change a booking\'s status here.',
      '**Waitlist**: walk-ins waiting for a chair. Add a walk-in, tap **Seat now** when it is their turn.',
      '**Customers**: search, add, and fix names and phone numbers.',
    ]);
    d.card(3, 'Do a practice run', [
      'Add yourself to the **Waitlist** as a walk-in, then tap **Seat now** and **Remove**.',
      'Open **Appointments** and look at how statuses change.',
      'Ask your owner if anything looks different from this guide.',
    ]);
  } else {
    d.card(1, 'Sign in and look around', signInBullets);
    d.card(2, 'See your day', [
      '**Overview** shows today. **Appointments** lists only **your own** bookings.',
      'New online bookings arrive as **Pending**. Tap the status to **Confirm** one, or **Cancel** if you cannot do it.',
      'When you finish a cut, set it to **Completed**. That gives the customer loyalty points and lets them review you.',
    ]);
    d.card(3, 'Show your best work', [
      'Go to **Posts**, add a photo and a caption. It appears on your profile and in the Stylist feed on The Chair App.',
      'Ask your owner to add your bio, specialties and portfolio, and to set your weekly hours.',
    ]);
  }
  d.h2('Put it on your phone like an app');
  d.para('Your salon has its own installable app. **Tip:** use the **Dashboard** link in its header, or bookmark your dashboard link, to get back to work in one tap.', { size: 9.6 });
  d.table(['Device', 'How to install'], [
    ['iPhone or iPad (Safari)', 'Open your salon page. Tap the **Share** icon, then **Add to Home Screen**, then **Add**.'],
    ['Android (Chrome)', 'Tap **Install** when the banner appears, or open the browser menu and choose **Install app** or **Add to Home screen**.'],
    ['Computer (Chrome or Edge)', 'Click the install icon at the right of the address bar, or open the browser menu and choose **Install**.'],
  ], [130, 363]);
}

function links(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Your links', 'Everything has an address', 'Save these. Every one of them works on a phone.');
  const rows: string[][] = [
    ['Sign in', `${c.host}/t/${c.tenantSlug}/login`, 'Your door, for everyone on the team.'],
    ['Your dashboard', `${c.host}/t/${c.tenantSlug}/dashboard`, '**Bookmark this.** Your working screens.'],
    ['Your salon page', `${c.host}/t/${c.tenantSlug}`, 'The page customers see. Share it everywhere.'],
    ['Book online', `${c.host}/t/${c.tenantSlug}/book`, 'Instagram bio, WhatsApp, texts, Google Business Profile.'],
    ['Customer appointments', `${c.host}/t/${c.tenantSlug}/appointments`, 'Where customers see and review their visits.'],
    ['The Chair App', c.host, 'Where new customers discover salons near them. You are listed automatically.'],
  ];
  d.table(['What it is', 'Link', 'Use it for'], rows, [88, 245, 160], {
    size: 8.8,
    linkCol: 1,
    linkUrls: [c.urls.login, c.urls.dashboard, c.urls.salon, c.urls.book, c.urls.appointments, c.urls.discover],
  });
  d.para(`Tap or click any link in the table to open it. To print a QR code for any of them, use the QR pages at the end (pages ${c.qrFirstPage} to ${c.qrFirstPage + QR_PAGES - 1}); each is on its own page so you can print just the one you need.`, { size: 9.6 });
  d.callout('moss', 'Get found on The Chair App',
    c.role === 'admin'
      ? 'Your salon appears in search results automatically. To show up for **Near me** and on the map, set your location in **Settings** (Go live, step 2). Photos, a short description and a few services make your listing far more tempting.'
      : 'Your salon appears in search results automatically, and the footer of every page links to The Chair App so customers can discover more salons.');
  d.callout('brass', 'Customers can create an account',
    'Customers can browse and book without signing up. When they choose **Create account** (name, email, phone and a password) they can also see their booking history and loyalty points, save favourite salons, follow stylists, and like and comment on posts.');
}

const MENU: Record<string, [string, string]> = {
  Overview: ["Today's bookings at a glance, plus counts of services, barbers, customers and people on the waitlist.", 'Every morning'],
  Appointments: ['Every booking. Filter by date and status, and change a booking\'s status.', 'All day'],
  Posts: ['Share a photo and a caption. It appears on the barber\'s profile and in the Stylist feed on The Chair App.', 'Weekly'],
  Waitlist: ['Walk-ins waiting for a chair. Add a walk-in, tap **Seat now**, or **Remove**.', 'As needed'],
  Services: ['Your menu: categories and services with duration, price, description and photo.', 'When prices change'],
  Barbers: ['Profiles with photo, bio, specialties, portfolio and weekly availability. Set hours here.', 'Setup, then rarely'],
  Staff: ['Add receptionists and barbers, see who has signed in, and reissue access.', 'When hiring'],
  Customers: ['Everyone who has booked with you. Search, add walk-in customers, fix a name or phone number.', 'As needed'],
  Reviews: ['What customers say after a completed visit. **Flag** hides a review from your page; **Unflag** restores it.', 'Weekly'],
  Analytics: ['Bookings per day, revenue from completed visits, busiest barbers and most popular services.', 'Weekly'],
  Settings: ['Business name, description, phone, email, colours, typeface, logo, cover image and map location.', 'Setup'],
  Account: ['Your details, and change your password.', 'Any time'],
};
const MENU_BY_ROLE: Record<WelcomeRole, string[]> = {
  admin: ['Overview', 'Appointments', 'Posts', 'Waitlist', 'Services', 'Barbers', 'Staff', 'Customers', 'Reviews', 'Analytics', 'Settings', 'Account'],
  receptionist: ['Overview', 'Appointments', 'Waitlist', 'Customers', 'Account'],
  barber: ['Overview', 'Appointments', 'Posts', 'Account'],
};

function dashboardMap(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Your dashboard', 'Every menu item, in plain words', 'This is the menu you will see. On a phone it is a slim column of icons in the same order.');
  const rows = MENU_BY_ROLE[c.role].map((k) => [k, MENU[k][0], MENU[k][1]]);
  rows.push(['View public page', "Opens the customer-facing salon page so you can see what customers see.", 'Any time']);
  rows.push(['Log out', 'Ends your session on this device. Use it on any shared computer or tablet.', 'When done']);
  d.table(['Menu item', "What it's for", 'How often'], rows, [92, 305, 96]);
}

function bigPicture(d: Doc, c: Ctx) {
  d.newPage();
  d.title('The big picture', 'How it all fits together', 'Follow one booking from the first tap to the review.');
  d.space(4);
  const nodes: Array<[string, string]> = [
    ['A customer finds you', 'The Chair App, your link or a QR'],
    ['They book a time', 'Only open times are offered'],
    ['A ticket arrives', 'Status: Pending. They get an email if email is set up'],
    ['You confirm it', 'In Appointments, set Confirmed'],
    ['The visit happens', 'Afterwards, set Completed. Loyalty points are added'],
    ['A review can follow', 'Shows on your salon page'],
  ];
  const nw = 150; const nh = 66; const gap = (CONTENT_W - nw * 3) / 2; const p = d.page; const py = (y: number) => PAGE_H - y;
  const top = d.y;
  nodes.forEach(([t, s], i) => {
    const r = Math.floor(i / 3); const k = i % 3;
    const x = MARGIN + k * (nw + gap); const y = top + r * (nh + 30);
    d.rect(x, y, nw, nh, { fill: COLOR.paper, border: COLOR.pine, bw: 1.1 });
    d.rect(x, y, 22, 18, { fill: COLOR.pine });
    p.drawText(String(i + 1), { x: x + 8, y: py(y + 13), size: 9.5, font: d.fonts.monoBold, color: COLOR.white });
    p.drawText(safeText(t), { x: x + 28, y: py(y + 13), size: 10, font: d.fonts.bold, color: COLOR.ink });
    d.textAt(s, x + 8, y + 26, nw - 16, 8.8, COLOR.soft);
    if (k < 2) { // arrow to the right
      const ax = x + nw + 2; const ay = y + nh / 2;
      p.drawLine({ start: { x: ax, y: py(ay) }, end: { x: ax + gap - 6, y: py(ay) }, thickness: 1.4, color: COLOR.brass });
      p.drawLine({ start: { x: ax + gap - 6, y: py(ay) }, end: { x: ax + gap - 11, y: py(ay - 3.5) }, thickness: 1.4, color: COLOR.brass });
      p.drawLine({ start: { x: ax + gap - 6, y: py(ay) }, end: { x: ax + gap - 11, y: py(ay + 3.5) }, thickness: 1.4, color: COLOR.brass });
    }
  });
  // elbow from node 3 down to node 4
  const x3 = MARGIN + 2 * (nw + gap) + nw / 2; const x4 = MARGIN + nw / 2; const ym = top + nh + 15;
  p.drawLine({ start: { x: x3, y: py(top + nh) }, end: { x: x3, y: py(ym) }, thickness: 1.4, color: COLOR.brass });
  p.drawLine({ start: { x: x3, y: py(ym) }, end: { x: x4, y: py(ym) }, thickness: 1.4, color: COLOR.brass });
  p.drawLine({ start: { x: x4, y: py(ym) }, end: { x: x4, y: py(top + nh + 30 - 2) }, thickness: 1.4, color: COLOR.brass });
  d.y = top + nh * 2 + 30 + 14;

  d.h2('What your customers see');
  d.para('Understanding their side makes you better at helping them, and at showing why the app saves time.');
  d.space(4);
  const pw = 128; const ph = 196; const pg = (CONTENT_W - pw * 3) / 2; const y0 = d.y;
  const caps = [
    ['Customers find you', 'Search by name or service, tap Near me, or browse the map.'],
    ['They book in four steps', 'Service, barber, an open time, then details. Only times you are free appear.'],
    ['They come back', 'They see their bookings and points, and can review a completed visit.'],
  ];
  for (let i = 0; i < 3; i++) {
    const x = MARGIN + i * (pw + pg);
    d.rect(x, y0, pw, ph, { fill: COLOR.white, border: hexGray(), bw: 1.6 });
    d.rect(x + 1, y0 + 1, pw - 2, 24, { fill: i === 1 ? COLOR.brassS : COLOR.pine });
    p.drawText(safeText(i === 0 ? 'The Chair App' : c.salonName), { x: x + 9, y: py(y0 + 17), size: 8.6, font: d.fonts.bold, color: COLOR.white });
    if (i === 0) {
      d.rect(x + 9, y0 + 36, pw - 18, 17, { border: COLOR.line, bw: 0.8 });
      p.drawText('Search salons or services...', { x: x + 13, y: py(y0 + 48), size: 6.6, font: d.fonts.reg, color: COLOR.faint });
      [0, 1, 2].forEach((k) => {
        const yy = y0 + 66 + k * 40;
        d.rect(x + 9, yy, pw - 18, 32, { fill: COLOR.paper, border: COLOR.line, bw: 0.8 });
        d.rect(x + 9, yy, 3, 32, { fill: k === 0 ? COLOR.brass : COLOR.line });
        p.drawText(safeText(k === 0 ? c.salonName : 'Another salon'), { x: x + 18, y: py(yy + 15), size: 7.6, font: d.fonts.bold, color: COLOR.ink });
        p.drawText(['0.8 km away', '1.6 km away', '2.4 km away'][k], { x: x + 18, y: py(yy + 26), size: 6, font: d.fonts.mono, color: COLOR.faint });
      });
    } else if (i === 1) {
      p.drawText('Pick a time', { x: x + 9, y: py(y0 + 46), size: 9, font: d.fonts.serif, color: COLOR.ink });
      ['9:00', '9:15', '9:30', '9:45', '10:00', '10:15', '10:30', '10:45', '11:00'].forEach((t, k) => {
        const r = Math.floor(k / 3); const cc = k % 3; const bx = x + 9 + cc * 38; const by = y0 + 56 + r * 26; const sel = k === 4;
        d.rect(bx, by, 34, 19, { fill: sel ? COLOR.brassS : COLOR.white, border: sel ? COLOR.brassS : COLOR.line, bw: 0.9 });
        p.drawText(t, { x: bx + 17 - d.fonts.mono.widthOfTextAtSize(t, 6.8) / 2, y: py(by + 13), size: 6.8, font: d.fonts.mono, color: sel ? COLOR.white : COLOR.ink });
      });
      d.rect(x + 9, y0 + ph - 32, pw - 18, 20, { fill: COLOR.brassS });
      p.drawText('Continue', { x: x + pw / 2 - 16, y: py(y0 + ph - 18), size: 7.6, font: d.fonts.bold, color: COLOR.white });
    } else {
      p.drawText('My appointments', { x: x + 9, y: py(y0 + 44), size: 9, font: d.fonts.serif, color: COLOR.ink });
      d.rect(x + 9, y0 + 56, pw - 18, 34, { fill: COLOR.paper, border: COLOR.line, bw: 0.8 });
      p.drawText('Retwist', { x: x + 15, y: py(y0 + 71), size: 7.8, font: d.fonts.bold, color: COLOR.ink });
      p.drawText('Sat 10:00', { x: x + 15, y: py(y0 + 83), size: 6.4, font: d.fonts.reg, color: COLOR.faint });
      d.rect(x + pw - 52, y0 + 62, 36, 12, { fill: hexAmber() });
      p.drawText('Pending', { x: x + pw - 47, y: py(y0 + 71), size: 6, font: d.fonts.bold, color: COLOR.ink });
      d.rect(x + 9, y0 + 100, pw - 18, 46, { fill: COLOR.paper, border: COLOR.line, bw: 0.8 });
      p.drawText('Loc maintenance', { x: x + 15, y: py(y0 + 115), size: 7.6, font: d.fonts.bold, color: COLOR.ink });
      p.drawText('Completed', { x: x + 15, y: py(y0 + 126), size: 6.4, font: d.fonts.reg, color: COLOR.faint });
      d.rect(x + 15, y0 + 130, 70, 12, { fill: COLOR.brassS });
      p.drawText('Leave a review', { x: x + 22, y: py(y0 + 139), size: 6.4, font: d.fonts.bold, color: COLOR.white });
      p.drawText('Loyalty points: 42', { x: x + 9, y: py(y0 + 160), size: 7, font: d.fonts.bold, color: COLOR.brassS });
    }
    d.textAt(`**${caps[i][0]}**`, x, y0 + ph + 10, pw + 6, 9.4, COLOR.ink);
    d.textAt(caps[i][1], x, y0 + ph + 23, pw + 6, 8.6, COLOR.soft);
  }
  d.y = y0 + ph + 68;
  d.para('Illustrations, not exact screens.', { size: 7.6, color: COLOR.faint, after: 4 });
  d.callout('brass', 'New bookings arrive as Pending',
    'A booking holds its time slot straight away, but stays **Pending** until the salon sets it to **Confirmed**. Customers are emailed when a booking is received, confirmed or cancelled if email is set up; if it is not, contact customers yourself when you need to.');
}
const hexGray = () => COLOR.faint;
const hexAmber = () => COLOR.sand;

// ============================================================ role chapters
function ownerGoLive(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Go live', 'Eight steps to a fully open salon', 'Tick each one off. Most take two to five minutes. Step 4 is the one that makes bookings possible.');
  d.space(2);
  d.card(1, 'Business info and branding (Settings)', [
    '**Business name** and a one or two sentence **description**. Customers read this at the top of your page.',
    '**Phone** and **email** for customers to reach you.',
    '**Primary colour** (buttons and header), **secondary colour** (highlights) and a **typeface style**: Modern sans-serif, Warm serif or Classic serif.',
    'Upload a **logo** (square works best) and a bright, landscape **cover image**.',
    'Choose a primary colour that white text is easy to read on. Then tap **Save settings** at the bottom.',
  ]);
  d.card(2, 'Location (Settings, then Location)', [
    'Search for your address or drag the pin to your door.',
    'This powers **Near me**, the map on The Chair App, and the **Get directions** link on your page. Save when the pin is right.',
  ]);
  d.card(3, 'Services (Services)', [
    'Make **categories** first, for example Locs, Retwist, Styling, Colour. Then add each **service**: name, duration in minutes, price, a short description, a photo and a category.',
    '**Duration decides the calendar.** Include cleanup time in it. A 90 minute service needs a 90 minute gap.',
    'Prices display with a $ sign. Keep names short and customer-friendly.',
  ]);
  d.card(4, 'Barbers and hours (Barbers)', [
    `Edit your starter profile, **${c.salonName}**: add a photo, a bio, **specialties** and a **portfolio** of your best work.`,
    '**Weekly availability:** switch on each working day and set the start and end time. Times are offered in **15-minute steps**, and a service only fits if it finishes before closing time.',
    'Booked time (Pending or Confirmed) is blocked automatically, so nobody can be double-booked.',
    'Have more people? Tap **Add** to create a profile for each barber, with their own photo, bio and hours.',
  ]);
  d.card(5, 'Add your team (Staff)', [
    'Tap **Add**, enter name and email, and choose **Receptionist** or **Barber**. A barber is given a public profile automatically (or link an existing one).',
    'The app generates a **temporary password** and a **welcome PDF** for them, just like this one. Download it and hand it over. They sign in with their email and that password, then choose their own.',
    'A team member locked out or with an expired password: tap **Reissue access** beside their name for a new temporary password and PDF.',
    'When someone leaves, tap **Remove**. Their access ends immediately.',
  ]);
  d.card(6, 'Preview and test', [
    'Tap **View public page** and look at it on your phone.',
    'Make a test booking with your own email (you can create a customer account when you sign in).',
    'Find it in **Appointments**, set it to **Confirmed**, then **Completed**. Your test customer should see loyalty points and get emails if email is set up.',
    'Set any other test booking to **Cancelled** so it does not distort your numbers.',
  ], { check: true });
  d.card(7, 'Share and get found', [
    'Put your **Book online** link in your Instagram bio, WhatsApp profile and Google Business Profile.',
    'Print the Book online QR from the QR pages for the counter and the window.',
    'Ask three regulars to book this week, and to leave a review after their visit.',
    'Check that your salon shows up when you search its name on The Chair App.',
  ], { check: true });
  d.card(8, 'Keep it fresh (Posts, Reviews, Analytics)', [
    'Post one photo a week. Fresh work brings people back to your page and shows up in the Stylist feed.',
    'Read new reviews weekly. Flag only reviews that are abusive or clearly not about your salon.',
    'Check Analytics on Mondays.',
  ]);
  d.ensure(215);
  d.h2('Your first week');
  d.table(['When', 'Do this', "You'll know it worked when..."], [
    ['Day 1', 'Set your hours, add services, make a test booking.', 'Your test booking shows in Appointments.'],
    ['Day 2', 'Add your logo, cover image, portfolio and team.', 'Your salon page looks like you.'],
    ['Day 3', 'Send your booking link to three regulars. Print the QR.', 'The first real booking arrives as Pending.'],
    ['Days 4 to 6', 'Check Appointments morning and evening. Confirm bookings.', 'Nobody waits long for a reply.'],
    ['Day 7', 'Mark finished visits Completed. Open Analytics.', "You can see the week's bookings and revenue."],
  ], [70, 230, 193]);
}

function ownerLoyalty(d: Doc) {
  d.h2('Loyalty points');
  d.para('Every time you set a visit to **Completed**, the customer is credited **1 point for each whole dollar** of that service, once per visit. They see their balance on **My appointments**. Redeeming points for rewards is up to your salon for now: the app records and shows the points, but does not spend them.');
}

function receptionistChapter(d: Doc) {
  d.newPage();
  d.title('Every day', 'The front desk, step by step', 'A simple rhythm keeps every customer happy.');
  d.card(1, 'Opening', [
    'Open **Overview** for today at a glance.',
    'Go to **Appointments** (today is selected). Confirm every **Pending** booking, or cancel ones you cannot honour.',
    'Glance at the **Waitlist** for anyone already waiting.',
  ]);
  d.card(2, 'Walk-ins', [
    '**Waitlist**, then **Add walk-in**: name, email, phone, barber and service.',
    'When a chair frees up, tap **Seat now**. Tap **Remove** if they leave.',
  ]);
  d.card(3, 'Phone calls', [
    'The app has no "book on behalf of" screen yet. The quickest way to book a caller is to send them your **booking link**, or add them to the **Waitlist** as a walk-in.',
    'To change or cancel a booking for a caller: find it in **Appointments** and set the status (**Cancelled**).',
  ]);
  d.card(4, 'Customers', [
    '**Customers**: search by name, email or phone. **Add** a walk-in customer, or edit a name or phone number.',
    'Email is a customer\'s identity, so it can\'t be edited. If someone booked with a typo, ask them to register with the right address.',
  ]);
  d.card(5, 'Closing', [
    'Set every finished booking to **Completed**: it adds loyalty points and lets customers review.',
    '**Log out** on any shared device.',
  ], { check: true });
}

function barberChapter(d: Doc) {
  d.newPage();
  d.title('Every day', 'Your day, step by step', 'You work with your own schedule. Here is how it flows.');
  d.card(1, 'Before your first client', [
    '**Overview** shows today. **Appointments** lists only **your** bookings, so you never see anyone else\'s.',
    'A new online booking is **Pending**. Tap its status to **Confirm** it, or **Cancel** if you cannot do it.',
  ]);
  d.card(2, 'Finishing a cut', [
    'Set the booking to **Completed** as soon as you finish.',
    'The customer is credited **loyalty points** (1 for every whole dollar of the service) and can leave you a review.',
  ]);
  d.card(3, 'Your profile and posts', [
    '**Posts**: add a photo and a caption. It shows on your profile and in the Stylist feed on The Chair App, where customers can like, comment and follow you.',
    'Your bio, specialties, portfolio and weekly hours are set by your owner in **Barbers**. Ask them to keep them current.',
    'Good posts: a clear before/after, a caption with the style name, one a week.',
  ]);
  d.card(4, 'Get more bookings', [
    'Share your salon\'s **Book online** link and QR with clients as they leave.',
    'Ask happy clients to leave a review after their visit.',
    'Post on quiet days.',
  ], { check: true });
}

// ============================================================ common back matter
function statusesAndPermissions(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Reference', 'Statuses and who can do what', 'If a button seems to be missing, it is usually just a role.');
  d.h2('Booking statuses');
  d.table(['Status', 'What it means', 'What you do'], [
    ['Pending', 'A new booking. It already holds the time slot.', 'Confirm it, or cancel if it cannot be done.'],
    ['Confirmed', 'Accepted. The slot stays blocked.', 'Serve the customer.'],
    ['Completed', 'The service is done. It counts toward revenue, adds loyalty points and lets the customer review.', 'Set this as soon as the visit finishes.'],
    ['Cancelled', 'The booking is off. The time becomes available again.', 'Use it when a customer cancels or does not come.'],
    ['Waitlist', 'A walk-in in the queue, with no fixed time.', 'Tap **Seat now** when a chair frees up.'],
  ], [70, 250, 173]);
  d.h2('Who can do what');
  d.table(['Can they...', 'Owner', 'Reception', 'Barber'], [
    ['See appointments', 'All', 'All', 'Their own only'],
    ["Change a booking's status", 'Yes', 'Yes', 'Yes (their own)'],
    ['Add walk-ins and manage the waitlist', 'Yes', 'Yes', 'No'],
    ['Add and edit customers', 'Yes', 'Yes', 'No'],
    ['Post photos to the feed', 'Yes', 'No', 'Yes (their own)'],
    ['Edit services, barbers, staff, settings', 'Yes', 'No', 'No'],
    ['Flag reviews and see analytics', 'Yes', 'No', 'No'],
    ['Change their own password', 'Yes', 'Yes', 'Yes'],
  ], [190, 80, 100, 123]);
  d.h2('Glossary');
  d.table(['Term', 'Meaning'], [
    ['Slot', 'A start time a customer can pick. Slots are 15 minutes apart.'],
    ['Walk-in', 'A customer who turns up without booking. Add them to the Waitlist.'],
    ['Temporary password', 'The password in your welcome pack. It works until the date shown, and you replace it at first sign-in.'],
    ['Stylist feed', 'The stream of photo posts from barbers, on The Chair App and each barber\'s page.'],
  ], [110, 383]);
}

function helpPage(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Help', 'Quick fixes and staying safe');
  const support = c.supportEmail;
  const faq: string[][] = [
    ['I cannot sign in', 'Use the email on page 1 (capital letters do not matter in the email; they do in the password). After several wrong attempts, sign-in pauses for 15 minutes: wait, then try once more.'],
    ['I forgot my password', `Tap **Forgot password** on the sign-in screen. If email is set up you will get a link that works for 1 hour. If not, email **${support}** from the address on your account and your password will be reset for you.`],
    ['My temporary password says expired', c.role === 'admin' ? `Email **${support}** and ask for a new one, or use **Forgot password**.` : 'Ask your salon owner to tap **Reissue access** beside your name in **Staff**, or use **Forgot password**.'],
    ['A menu item is missing', 'Your role does not include it. See the permissions table.'],
    ['Customers see "No open times"', 'The barber\'s **Weekly availability** needs the day switched on, with a window longer than the service. Only the owner can change it.'],
    ['A customer cannot sign in', 'They can create an account with **Create account** on the sign-in screen, or use **Forgot password** if they booked before as a guest.'],
    ['My salon is not on The Chair App', 'The owner needs to set the location in Settings. Then search the exact salon name.'],
  ];
  d.table(['If this happens...', 'Try this'], faq, [130, 363]);
  d.h2('Security and privacy, in plain words');
  d.table(['Do', "Don't"], [
    ['Keep your password in a password manager.', 'Share your sign-in, even with someone you trust. Ask the owner to add them as staff instead.'],
    ['Log out on any shared computer or tablet.', 'Forward or screenshot page 1 of this pack.'],
    ['Treat customer names, emails and phone numbers as private.', 'Use customer details for anything except their booking.'],
    ['Change your password from **Account** at any time.', c.role === 'admin' ? 'Leave a former team member with access: tap **Remove** the day they leave.' : 'Ignore a strange sign-in email: tell your owner.'],
  ], [246, 247], { size: 9.2, boldFirst: false });
  d.callout('rust', 'If you think someone has your password', `Change it now from **Account**. If you cannot sign in, email ${support}.`);
}

function quickCard(d: Doc, c: Ctx) {
  d.newPage();
  d.title('Keep this one', 'Quick reference card', 'Print this page and keep it by the till.');
  const boxes: Record<WelcomeRole, Array<[string, string[]]>> = {
    admin: [
      ['Every morning', ['Open **Overview**.', '**Appointments**: confirm Pending bookings.', 'Check the **Waitlist**.']],
      ['A walk-in arrives', ['**Waitlist**, then **Add walk-in**.', 'Name, email, phone, barber, service.', 'Tap **Seat now** when it is their turn.']],
      ['A customer changes plans', ['Find the booking in **Appointments**.', 'Set it to **Cancelled**.', 'They book again with your link.']],
      ['End of the day', ['Set finished bookings to **Completed**.', 'Post one great photo.', '**Log out** on shared devices.']],
      ['Every Monday', ['**Analytics**: last 7 days, then 30.', 'Read new **Reviews**.', 'Plan a post for quiet days.']],
      ['Someone joins or leaves', ['**Staff**, then **Add**: download their PDF.', 'Locked out? **Reissue access**.', 'Leaving? **Remove** the same day.']],
    ],
    receptionist: [
      ['Opening', ['Open **Overview**.', 'Confirm every Pending booking.', 'Check the **Waitlist**.']],
      ['A walk-in arrives', ['**Waitlist**, then **Add walk-in**.', 'Tap **Seat now** when it is their turn.', '**Remove** if they leave.']],
      ['A phone call', ['Send your **booking link**, or', 'add them to the **Waitlist**.', 'To cancel: set **Cancelled**.']],
      ['A customer detail is wrong', ['**Customers**, then search.', 'Edit name or phone.', 'Email cannot be edited.']],
      ['Closing', ['Set finished bookings to **Completed**.', 'Check nobody is left Pending.', '**Log out**.']],
      ['Locked out?', ['Tap **Forgot password**.', `Or email ${c.supportEmail}.`, 'Ask the owner to reissue access.']],
    ],
    barber: [
      ['Start of day', ['Open **Appointments**.', '**Confirm** each Pending booking.', 'Cancel any you cannot do.']],
      ['Finishing a cut', ['Set it to **Completed**.', 'The customer earns loyalty points.', 'They can now review you.']],
      ['Show your work', ['**Posts**: add a photo and caption.', 'One good post a week.', 'Post on quiet days.']],
      ['Something is missing', ['Bio, portfolio or hours?', 'Ask your owner: they edit **Barbers**.', 'You cannot edit them yourself.']],
      ['Your password', ['Change it in **Account**.', 'Forgot it? **Forgot password**.', `Or email ${c.supportEmail}.`]],
      ['End of day', ['Set finished cuts to **Completed**.', '**Log out** on shared devices.', 'Share the Book online QR.']],
    ],
  };
  const list = boxes[c.role];
  const bw = CONTENT_W / 2; const bh = 112; const y0 = d.y + 4;
  d.rect(MARGIN, y0, CONTENT_W, bh * 3, { fill: COLOR.paper, border: COLOR.line, bw: 0.9 });
  list.forEach(([title, items], i) => {
    const x = MARGIN + (i % 2) * bw; const y = y0 + Math.floor(i / 2) * bh;
    if (i % 2 === 1) d.hline(x, x, y, COLOR.line, 0.1);
    d.page.drawText(safeText(title), { x: x + 12, y: PAGE_H - (y + 24), size: 12.5, font: d.fonts.serif, color: COLOR.pine });
    let cy = y + 34;
    items.forEach((it) => { cy += d.textAt('- ' + it, x + 12, cy, bw - 24, 9.4, COLOR.soft) + 2; });
  });
  // grid lines
  d.page.drawLine({ start: { x: MARGIN + bw, y: PAGE_H - y0 }, end: { x: MARGIN + bw, y: PAGE_H - (y0 + bh * 3) }, thickness: 0.9, color: COLOR.line });
  [1, 2].forEach((k) => d.page.drawLine({ start: { x: MARGIN, y: PAGE_H - (y0 + bh * k) }, end: { x: MARGIN + CONTENT_W, y: PAGE_H - (y0 + bh * k) }, thickness: 0.9, color: COLOR.line }));
  d.y = y0 + bh * 3 + 18;
  d.h2(`Help more people find ${c.salonName}`);
  d.para(`Every booking starts with a link. Share yours, and tell people they can also discover salons like yours at **${c.host}**.`);
}

// ============================================================ QR pages
function qrPages(d: Doc, c: Ctx) {
  d.qrPage({ salon: c.salonName, heading: 'Team sign-in', sub: 'Scan with your phone camera to open the sign-in page.', url: c.urls.login, display: `${c.host}/t/${c.tenantSlug}/login`,
    note: 'This code only opens the sign-in page. It never contains a password.', matrix: qrMatrix(c.urls.login) });
  d.qrPage({ salon: c.salonName, heading: 'Book your next visit', sub: 'Scan with your phone camera to see open times and book in about a minute.', url: c.urls.book, display: `${c.host}/t/${c.tenantSlug}/book`,
    note: 'Print this page for the counter, the mirror or the window.', matrix: qrMatrix(c.urls.book) });
  d.qrPage({ salon: c.salonName, heading: 'Find us on The Chair App', sub: 'Scan to discover salons and barbershops near you, and book online.', url: c.urls.discover, display: c.host,
    note: 'Print this page to help more people find you.', matrix: qrMatrix(c.urls.discover) });
}

// ============================================================ the guide
/** Draws the whole guide onto `d`. Returns nothing; page count is read from d.pages. */
export function drawGuide(d: Doc, c: Ctx) {
  accessPage(d, c);
  getStarted(d, c);
  links(d, c);
  dashboardMap(d, c);
  bigPicture(d, c);
  if (c.role === 'admin') { ownerGoLive(d, c); ownerLoyalty(d); }
  else if (c.role === 'receptionist') receptionistChapter(d);
  else barberChapter(d);
  statusesAndPermissions(d, c);
  helpPage(d, c);
  quickCard(d, c);
  qrPages(d, c);
}
export const QR_PAGE_COUNT = QR_PAGES;
