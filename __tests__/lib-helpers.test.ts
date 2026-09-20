// __tests__/lib-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { validatePassword, generateTempPassword } from '@/lib/password';
import { normalizeEmail, isValidEmail, isValidPhone, slugify, safeNextPath } from '@/lib/identity';
import { pointsForPrice } from '@/lib/loyalty';
import { escapeHtml } from '@/lib/text';
import { manualResetMessage, SUPPORT_EMAIL } from '@/lib/support';

describe('validatePassword', () => {
  it('accepts a normal password, including the owner starting password', () => {
    expect(validatePassword('Quano-P@ss', 'q@x.com')).toBeNull();
  });
  it.each([
    ['', 'required'], ['short1', 'at least 8'], ['a'.repeat(73), '72'], ['Password123', 'too common'], ['Q@x.com-1', null],
  ])('%s', (pw, expected) => {
    const r = validatePassword(pw, 'q@x.com');
    if (expected) expect(r).toContain(expected); else expect(r).toBeNull();
  });
  it('rejects a password equal to the email (any case)', () => {
    expect(validatePassword('Casey@Example.com', 'casey@example.com')).toContain('same as your email');
  });
  it('rejects non-strings', () => { expect(validatePassword(undefined)).toContain('required'); });
});

describe('generateTempPassword', () => {
  it('is 4-4-4 from an unambiguous alphabet and different every time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTempPassword();
      expect(p).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
      expect(validatePassword(p)).toBeNull();
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe('identity helpers', () => {
  it('normalizeEmail trims and lower-cases, and tolerates non-strings', () => {
    expect(normalizeEmail('  Foo@BAR.com ')).toBe('foo@bar.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
  it('isValidEmail / isValidPhone', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidPhone('+1 (555) 010-0100')).toBe(true);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('123')).toBe(false);
  });
  it('slugify', () => {
    expect(slugify('Marcus Lee')).toBe('marcus-lee');
    expect(slugify('Zoë  O\'Neil!')).toBe('zoe-o-neil');
    expect(slugify('李')).toBe('barber');
  });
  it('safeNextPath only allows same-site paths', () => {
    expect(safeNextPath('/t/demo/book')).toBe('/t/demo/book');
    for (const bad of ['//evil.com', 'https://evil.com', 'javascript:alert(1)', '/\\evil.com', undefined, 42]) expect(safeNextPath(bad as any)).toBeNull();
  });
});

describe('loyalty', () => {
  it('one point per whole currency unit, never negative or NaN', () => {
    expect(pointsForPrice(45.5)).toBe(45);
    expect(pointsForPrice(30)).toBe(30);
    expect(pointsForPrice(0.99)).toBe(0);
    for (const bad of [undefined, null, 'x', -5, NaN]) expect(pointsForPrice(bad)).toBe(0);
  });
});

describe('escapeHtml + support', () => {
  it('escapes markup so names cannot inject into emails', () => {
    expect(escapeHtml('<b>"O\'Neil" & co</b>')).toBe('&lt;b&gt;&quot;O&#39;Neil&quot; &amp; co&lt;/b&gt;');
  });
  it('the manual-reset message names the support address', () => {
    expect(SUPPORT_EMAIL).toBe('geehyness22@gmail.com');
    expect(manualResetMessage()).toContain('geehyness22@gmail.com');
  });
});
