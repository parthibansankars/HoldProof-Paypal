import type { Criterion, PhotoEvidence } from '../types';
import { roundCoord } from './geo';

/**
 * Builds the canonical text that is hashed into the evidence digest.
 * Key order is fixed by the object literal, so the output is deterministic.
 * The digest is written to the PayPal order's custom_id before the client approves.
 */
export function buildCanonical(input: {
  title: string;
  amount: string;
  currency: string;
  criteria: Criterion[];
  before: PhotoEvidence;
}): string {
  return JSON.stringify({
    v: 1,
    app: 'HoldProof',
    title: input.title,
    amount: input.amount,
    currency: input.currency,
    criteria: input.criteria.map((c) => c.text),
    before: {
      sha256: input.before.sha256,
      capturedAt: input.before.capturedAt,
      lat: roundCoord(input.before.lat),
      lng: roundCoord(input.before.lng),
    },
  });
}

export function shortDigest(digest: string): string {
  return digest.slice(0, 12).toUpperCase();
}

export function isHexDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
