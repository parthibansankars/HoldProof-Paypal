/**
 * HACKATHON BUILD — PayPal SANDBOX ONLY.
 * The host is hard-coded to the sandbox. There is deliberately no switch to production:
 * production must route through a backend that holds the secret (see README).
 */
export const PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';
export const PAYPAL_ENVIRONMENT_LABEL = 'PayPal Sandbox';

export const AI_MODEL = 'claude-opus-5-5';

/** Return/cancel URLs after the client approves on PayPal. Deep link back into the app. */
export const APPROVAL_RETURN_URL = 'holdproof://approved';
export const APPROVAL_CANCEL_URL = 'holdproof://cancelled';

export const POLL_INTERVAL_MS = 3000;

export const HACKATHON_NOTICE =
  'HoldProof is a hackathon demonstration built for the PayPal AI Hackathon 2026. ' +
  'It works only with PayPal Sandbox credentials and never moves real money. ' +
  'Do not enter production PayPal credentials. Your keys are stored only in this device’s encrypted storage ' +
  'and are sent only to PayPal Sandbox and the AI provider.';
