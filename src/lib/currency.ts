// src/lib/currency.ts
//
// Every tenant sets its own operating currency (Tenant.currency, ISO 4217
// code) instead of the app assuming one globally — the platform defaults
// new tenants to ZAR (South African Rand), not USD, since that's this
// deployment's home market, but nothing stops a tenant from picking any
// currency on the list. formatPrice() is the ONE place a price becomes a
// display string; every page that used to hardcode a "$" prefix now calls
// this instead, so a single fix here is a single fix everywhere.
export const DEFAULT_CURRENCY = 'ZAR';

interface CurrencyDef {
  code: string;
  label: string;
  locale: string; // drives grouping/decimal conventions Intl.NumberFormat uses
}

// Deliberately not exhaustive (ISO 4217 has ~180 codes) — this is the set
// worth surfacing in a <select>: the platform's home currency first, then
// other currencies common across the African salon/barbershop market this
// app targets, then the handful of major global currencies a tenant might
// still reasonably choose.
export const CURRENCIES: CurrencyDef[] = [
  { code: 'ZAR', label: 'South African Rand (R)', locale: 'en-ZA' },
  { code: 'NAD', label: 'Namibian Dollar (N$)', locale: 'en-NA' },
  { code: 'BWP', label: 'Botswana Pula (P)', locale: 'en-BW' },
  { code: 'NGN', label: 'Nigerian Naira (₦)', locale: 'en-NG' },
  { code: 'KES', label: 'Kenyan Shilling (KSh)', locale: 'en-KE' },
  { code: 'GHS', label: 'Ghanaian Cedi (₵)', locale: 'en-GH' },
  { code: 'USD', label: 'US Dollar ($)', locale: 'en-US' },
  { code: 'GBP', label: 'British Pound (£)', locale: 'en-GB' },
  { code: 'EUR', label: 'Euro (€)', locale: 'en-IE' },
];

const CURRENCY_BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function isKnownCurrency(code: unknown): code is string {
  return typeof code === 'string' && CURRENCY_BY_CODE.has(code);
}

/**
 * Formats an amount as that currency's price string (e.g. "R 250.00",
 * "$45.00"). Falls back to DEFAULT_CURRENCY for a missing or unrecognized
 * code — every tenant created before this field existed reads as ZAR
 * rather than throwing or showing "undefined".
 */
export function formatPrice(amount: number, currencyCode?: string | null): string {
  const def = (currencyCode && CURRENCY_BY_CODE.get(currencyCode)) || CURRENCY_BY_CODE.get(DEFAULT_CURRENCY)!;
  try {
    return new Intl.NumberFormat(def.locale, { style: 'currency', currency: def.code, currencyDisplay: 'symbol' }).format(amount);
  } catch {
    // An exotic/misconfigured code Intl can't format as a currency at all —
    // still show the number rather than crash the page it's rendered on.
    return `${def.code} ${amount.toFixed(2)}`;
  }
}

/** Just the symbol/short prefix (e.g. "R", "$") — for compact inline contexts like a price input's adornment. */
export function currencySymbol(currencyCode?: string | null): string {
  const def = (currencyCode && CURRENCY_BY_CODE.get(currencyCode)) || CURRENCY_BY_CODE.get(DEFAULT_CURRENCY)!;
  try {
    const parts = new Intl.NumberFormat(def.locale, { style: 'currency', currency: def.code }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || def.code;
  } catch {
    return def.code;
  }
}
