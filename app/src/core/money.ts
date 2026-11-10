/** Money is handled in integer cents to avoid floating-point drift. */

export function toCents(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid amount: "${value}"`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function fromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid cents value: ${cents}`);
  }
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

export function isValidAmount(value: string, minCents = 100, maxCents = 1_000_000): boolean {
  try {
    const cents = toCents(value);
    return cents >= minCents && cents <= maxCents;
  } catch {
    return false;
  }
}

export function formatMoney(value: string, currency = 'USD'): string {
  const cents = toCents(value);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  const whole = Math.floor(cents / 100).toLocaleString('en-US');
  return `${symbol}${whole}.${String(cents % 100).padStart(2, '0')}`;
}
