Rating: [choose your rating]

The open format was a strength: with no fixed problem statements, we could start from a real problem (trust between solo workers and clients they don't know) rather than fitting an idea to a track. The PayPal Sandbox made it practical to build real money flows without risk: Orders v2 with intent AUTHORIZE, then authorize, capture, void and refund, gave us exactly the "hold first, release on proof" lifecycle our product needed, and the custom_id field let us anchor an evidence fingerprint inside the order itself.

Suggestions:
- A mobile-first quickstart (Android/React Native) would help. Most examples assume a web front end with a backend, and the secure pattern for an app without its own server is not obvious.
- The Agent Toolkit and MCP server examples are server-side; a note on how mobile or client-only projects should use them would help teams decide early.
- One consolidated page listing which REST APIs and features are available in the Sandbox (for example Disputes, and accepted return URL formats such as app deep links) would save trial and error.
- The rules and resources pages were hard to access with automated tools during research; a plain downloadable copy of the rules would help.

(Edit to match your own experience before submitting.)
