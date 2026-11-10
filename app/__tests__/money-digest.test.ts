import { createHash } from 'crypto';
import { buildCanonical, isHexDigest, shortDigest } from '../src/core/digest';
import { distanceMeters } from '../src/core/geo';
import { formatMoney, fromCents, isValidAmount, toCents } from '../src/core/money';

describe('money', () => {
  it('converts between decimal strings and cents exactly', () => {
    expect(toCents('60')).toBe(6000);
    expect(toCents('60.5')).toBe(6050);
    expect(toCents('0.07')).toBe(7);
    expect(fromCents(6050)).toBe('60.50');
    expect(fromCents(7)).toBe('0.07');
  });

  it('rejects malformed amounts', () => {
    expect(() => toCents('60.001')).toThrow();
    expect(() => toCents('-5')).toThrow();
    expect(() => toCents('1e3')).toThrow();
    expect(isValidAmount('0.50')).toBe(false);
    expect(isValidAmount('10000.01')).toBe(false);
    expect(isValidAmount('60.00')).toBe(true);
  });

  it('formats for display', () => {
    expect(formatMoney('1234.5')).toBe('$1,234.50');
  });
});

describe('evidence digest', () => {
  const record = {
    title: 'Clear garage corner',
    amount: '60.00',
    currency: 'USD',
    criteria: [{ id: 'c1', text: 'No boxes on the floor', visibleEvidence: 'Bare floor' }],
    before: { fileName: 'x.jpg', sha256: 'f'.repeat(64), capturedAt: '2026-11-10T10:00:00.000Z', lat: 12.971612345, lng: 77.594561234, accuracyMeters: 4 },
  };
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');

  it('is deterministic and fits PayPal custom_id (max 127 chars)', () => {
    const d1 = hash(buildCanonical(record));
    const d2 = hash(buildCanonical({ ...record, criteria: [...record.criteria] }));
    expect(d1).toBe(d2);
    expect(isHexDigest(d1)).toBe(true);
    expect(d1.length).toBeLessThanOrEqual(127);
    expect(shortDigest(d1)).toHaveLength(12);
  });

  it('changes when any anchored field changes', () => {
    const base = hash(buildCanonical(record));
    expect(hash(buildCanonical({ ...record, amount: '61.00' }))).not.toBe(base);
    expect(hash(buildCanonical({ ...record, criteria: [{ ...record.criteria[0], text: 'Boxes moved' }] }))).not.toBe(base);
    expect(hash(buildCanonical({ ...record, before: { ...record.before, sha256: 'e'.repeat(64) } }))).not.toBe(base);
    expect(hash(buildCanonical({ ...record, before: { ...record.before, capturedAt: '2026-11-10T10:00:01.000Z' } }))).not.toBe(base);
  });

  it('ignores sub-metre GPS noise beyond five decimal places', () => {
    const base = hash(buildCanonical(record));
    expect(hash(buildCanonical({ ...record, before: { ...record.before, lat: 12.971614 } }))).toBe(base);
  });
});

describe('geo', () => {
  it('measures short distances', () => {
    const d = distanceMeters(12.97161, 77.59456, 12.97165, 77.5946);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(10);
  });
});
