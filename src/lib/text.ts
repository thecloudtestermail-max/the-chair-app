// src/lib/text.ts

/** Escapes regex metacharacters so user-typed search text is never
 * interpreted as a pattern (audit fix — prevents both malformed-regex
 * 500s and pathological-backtracking DoS from crafted input). */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escapes text for safe interpolation into HTML emails. */
export function escapeHtml(input: string): string {
  return String(input).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
