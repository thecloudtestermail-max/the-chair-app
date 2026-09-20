// src/lib/loyalty.ts
//
// One loyalty point per whole currency unit of a completed service. Points
// were previously displayed to customers but never credited anywhere.
export function pointsForPrice(price: unknown): number {
  const n = Math.floor(Number(price));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
