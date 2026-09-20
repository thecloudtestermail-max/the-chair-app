// src/hooks/useCurrency.ts
//
// The dashboard layout already loads the tenant document server-side
// (dashboard/layout.tsx) before any child page renders, so its currency
// can be threaded down the same way useRole.ts threads the verified role:
// one context, set once by DashboardShell, read by any page that needs to
// format a price — no per-page fetch, no risk of a page forgetting to ask
// for it and silently defaulting to the wrong currency.
'use client';
import { createContext, useContext } from 'react';
import { DEFAULT_CURRENCY } from '@/lib/currency';

const CurrencyContext = createContext<string | null>(null);

export const CurrencyProvider = CurrencyContext.Provider;

/** The tenant's currency code, or DEFAULT_CURRENCY outside a CurrencyProvider (e.g. in shared UI rendered before the dashboard shell mounts). */
export function useCurrency(): string {
  return useContext(CurrencyContext) || DEFAULT_CURRENCY;
}
