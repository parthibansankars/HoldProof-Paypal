/**
 * HACKATHON BUILD — PayPal SANDBOX ONLY.
 * The host is hard-coded to the sandbox. There is deliberately no switch to production:
 * production must route through a backend that holds the secret (see README).
 */
export const PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com';
export const PAYPAL_ENVIRONMENT_LABEL = 'PayPal Sandbox';
/** The only two hosts that ever receive the keys or any job data. */
export const PAYPAL_HOST = PAYPAL_BASE_URL.replace(/^https:\/\//, '');
export const AI_HOST = 'generativelanguage.googleapis.com';
export const AI_BASE_URL = `https://${AI_HOST}`;
export const AI_PROVIDER = 'Google Gemini API';

/** Stable Gemini model with image input, structured output and a free tier (Google AI Studio). */
export const AI_MODEL = 'gemini-3.5-flash-lite';

/** Return/cancel URLs after the client approves on PayPal. Deep link back into the app. */
export const APPROVAL_RETURN_URL = 'holdproof://approved';
export const APPROVAL_CANCEL_URL = 'holdproof://cancelled';

export const POLL_INTERVAL_MS = 3000;

export interface NoticeSection {
  heading: string;
  lines: string[];
}

export interface Notice {
  title: string;
  lead: string;
  sections: NoticeSection[];
}

/**
 * The setup notice. Shown as a blocking popup before any key can be entered,
 * re-readable from the setup screen, and shown in full in Settings.
 * README.md and docs/SECURITY.md mirror this text.
 */
export const SETUP_NOTICE: Notice = {
  title: 'Hackathon demonstration only',
  lead:
    'HoldProof is a hackathon demonstration built for the PayPal AI Hackathon 2026. It works only with PayPal Sandbox ' +
    'test credentials and never moves real money. Read this notice before you enter any key.',
  sections: [
    {
      heading: 'What HoldProof is',
      lines: [
        'HoldProof places a PayPal authorization hold that the client approves before work starts. The hold is captured ' +
          'only after AI checks the before-and-after photos against the agreed criteria and a deterministic Judge permits it.',
      ],
    },
    {
      heading: 'Hackathon demonstration, PayPal Sandbox only',
      lines: [
        'Built for the PayPal AI Hackathon 2026. It is not a production product.',
        'It works only with PayPal Sandbox and never moves real money.',
        'Never enter production (live) PayPal credentials. The PayPal host is hard-coded to the sandbox, and no setting changes it.',
      ],
    },
    {
      heading: 'Why the app asks for keys',
      lines: [
        'This build has no server-side code. The app calls PayPal Sandbox and the AI provider directly from this phone, which is why it needs your keys.',
        'This is acceptable only because the keys are sandbox and test keys entered by the person testing the app.',
      ],
    },
    {
      heading: 'The three keys and what each is used for',
      lines: [
        'PayPal Sandbox Client ID and Client Secret: used together to obtain a PayPal access token, then to create the order, authorize, capture, refund and void, and to read order, payment and dispute status.',
        `Gemini API key (${AI_PROVIDER}): used for the Proposer and Critic AI calls (model ${AI_MODEL}) that scope the job, check the photos and draft dispute responses.`,
      ],
    },
    {
      heading: 'Where the keys are stored',
      lines: [
        'Only in this device’s encrypted storage (Android Keystore, through secure storage).',
        'Never in the app package (APK), the source code, logs, the activity timeline, evidence records or PDF/JSON exports.',
      ],
    },
    {
      heading: 'Where the keys and your data are sent',
      lines: [
        `The keys are sent only to ${PAYPAL_HOST} (PayPal Sandbox) and ${AI_HOST} (the AI provider).`,
        `To ${AI_HOST}: the job description and price, the agreed criteria, the BEFORE and AFTER photos, and, when you draft a dispute response, the dispute summary and the evidence record (including photo times and locations).`,
        `To ${PAYPAL_HOST}: the job title, the amount, the evidence digest, a job reference id (also used to build the capture invoice id) and, for a partial refund, the text of the contested criterion in the note to the client.`,
        'Nothing is sent anywhere else. There is no HoldProof server and no analytics.',
      ],
    },
    {
      heading: 'AI cost and data use',
      lines: [
        'A free Gemini API key works. Each photo check makes two AI calls, and the free tier has per-minute and per-day request limits.',
        'On the Gemini free tier, Google may use the content you send (job description and photos) to improve its products. On a paid Gemini tier it does not. Use a paid key, or avoid photographing people or private details, if that matters to you.',
        'Any paid usage is billed to the owner of the Gemini API key.',
      ],
    },
    {
      heading: 'How to get the keys',
      lines: [
        'PayPal: PayPal Developer Dashboard > Apps & Credentials > Sandbox > create or open a REST app, then copy its Client ID and Secret.',
        'Gemini: Google AI Studio (aistudio.google.com) > Get API key > create a key. No payment card is needed for the free tier.',
        'The sandbox BUYER (personal) account is used by the client on PayPal’s own approval page. It is never entered into this app.',
      ],
    },
    {
      heading: 'How to remove the keys',
      lines: ['Settings > Remove keys from this device, or uninstall the app. Both delete the keys from this device.'],
    },
    {
      heading: 'How a production release would differ',
      lines: [
        'The keys would never be on the phone. HoldProof’s own backend service would hold the secrets, call PayPal, verify PayPal webhook signatures, and run the Judge server-side so that a modified app could not bypass it.',
      ],
    },
    {
      heading: 'Honest limits',
      lines: [
        'HoldProof is an authorization hold with AI evidence checking. It is not escrow and not a neutral arbiter.',
        'Photos can be staged and GPS can be spoofed. The record proves that it was not changed after the client approved, not that the photos are truthful.',
        'PayPal decides disputes.',
      ],
    },
  ],
};

/** Short form, kept for places that need a single sentence. */
export const HACKATHON_NOTICE = SETUP_NOTICE.lead;
