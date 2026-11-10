1. Google Gemini API (gemini-3.5-flash-lite, free tier via Google AI Studio) — the AI inside the product: the Proposer and Critic agents that scope jobs into photo-checkable criteria, compare before-and-after photos with vision, and draft dispute responses, all with structured JSON output.

2. Claude Code (Anthropic), in VS Code — our development assistant. It wrote and refactored the React Native/TypeScript app, the PayPal Sandbox client, the Judge logic and the unit tests, diagnosed and fixed the Android build, and drafted documentation.

3. Claude multi-agent workflows (run through Claude Code) — used during development: three agents (Innovator, Devil's Advocate, Grand Judge) debated and selected the product idea, and four agents (Reviewer, Devil's Advocate, Fixer, Verifier) reviewed the code, fixed 16 functional gaps and verified each fix.

All AI output that could move money passes through a deterministic, unit-tested Judge.
