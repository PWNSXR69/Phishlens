# PhishLens 🛡️

A Chrome extension that analyzes pages in real time for common phishing patterns:
lookalike domains, suspicious redirect chains, and credential-stealing forms.

## Features (v0.2)

- **Lookalike domain detection** — flags domains like `paypa1.com` or `micr0soft-login.com`
  using Levenshtein (edit) distance + homoglyph normalization against a seed list of
  commonly-impersonated brands.
- **Credential form inspection** — scans every form with a password field and flags it if
  the form submits cross-domain or over plain HTTP.
- **Redirect chain scoring** (`lib/domain.js` + `background.js`) — not just a shortener
  blocklist. Scores each navigation chain on: known shorteners, number of *unrelated
  registrable domains* crossed (correctly handling `co.uk`-style multi-part TLDs so
  subdomain hops don't false-positive), chain length, HTTPS→HTTP downgrades mid-chain,
  and open-redirect-style query params (`?url=`, `?next=`, etc. pointing off-domain).
- **Persistent scan history** — every analyzed page is written to `chrome.storage.local`
  (survives service worker restarts and browser relaunches), viewable in a History tab
  in the popup, with a clear-history control.
- **In-page warning banner** — when a page scores "suspicious" or "dangerous",
  `content.js` injects a dismissible banner directly into the page via Shadow DOM
  (isolated from the page's own CSS in both directions), listing the specific reasons.
  Deliberately does NOT mimic a native browser/OS warning — it's clearly labeled as
  coming from the PhishLens extension, since spoofing trusted system UI is itself a
  phishing technique.
- **System notification for dangerous pages** — a `chrome.notifications` toast fires
  for the worst-scoring pages, in addition to the in-page banner.
- **Badge verdict** — green / amber / red badge on the extension icon; popup shows the
  specific reasons behind the verdict via a viewfinder-style HUD readout.

## Running tests

```
npm install
npm test
```

`npm test` runs two things, in order:

1. **`scripts/check-scope-collisions.js`** — this project hit the same bug three
   separate times: two files, each valid on its own, throwing
   `Identifier 'x' has already been declared` only once Chrome actually loads them
   together into one shared scope (`importScripts()` in the service worker,
   multiple `content_scripts` entries, multiple `<script>` tags in the popup).
   `node --check somefile.js` can't catch this — it only ever sees one file at a
   time. This script simulates the REAL load order for each shared-scope bundle
   (reading it straight from `manifest.json` / `popup.html`, so it can't drift out
   of sync with them) and compiles the concatenated result. Redeclaration errors are
   a parse-time error, so compiling is enough — no browser, no mocking required.
2. **Vitest** — 47 tests covering `levenshtein()`, `similarityScore()`,
   `normalizeHomoglyphs()`, `getRegistrableDomain()`, `analyzeRedirectChain()`, and
   the shared severity-scoring logic. A few are deliberately named
   `KNOWN LIMITATION: ...` — they document real edge cases where the simplified
   logic gets it wrong (e.g. `"modern"` → `"modem"` from the homoglyph normalizer)
   rather than hiding them.

The redirect-scoring logic lives in `lib/redirect-analysis.js` as a pure function —
no `chrome.*` calls, just URL strings in, a plain object out. `background.js` is the
thin "imperative shell" that wires real browser events to it. This split (often called
"functional core, imperative shell") is what makes `analyzeRedirectChain` testable
with zero mocking, even though it's the most complex logic in the project.

**The naming rule that would have prevented all three bugs:** every `lib/*.js` file
declares its exports as top-level `function`/`const` before attaching them to
`globalThis.PhishLensX`. Any other file sharing that same scope (via `importScripts`,
multiple `content_scripts` entries, or multiple `<script>` tags) must NEVER
destructure or `const`-declare a name that matches one of those exports — always
alias it to something different (e.g. `const getSeverityLabel = self.PhishLensSeverity.severityLabel`,
not `const { severityLabel } = ...`).

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**, select this folder
4. Visit any page — click the extension icon to see the verdict

## Architecture

```
content.js  --(chrome.runtime.sendMessage)-->  background.js  <--(query)--  popup.js
   |                                                  |
   scans DOM (forms, hostname)             tracks webNavigation events,
   in the PAGE's isolated world              stores per-tab state, sets badge
```

Three separate JS contexts, deliberately isolated from each other and from the
page's own scripts — the same "least privilege" principle you'd check for in a
real security audit.

## Concepts covered

- **Levenshtein distance** (`lib/similarity.js`) — classic dynamic programming
  problem, applied to a real detection use case instead of just a LeetCode drill.
- **Homoglyph substitution** — why edit distance alone isn't enough (`rn` → `m`, `0` → `o`).
- **Public Suffix List problem** (`lib/domain.js`) — why `hostname.split(".").slice(-2)`
  silently breaks on `co.uk`-style domains, and how to correctly compare "same site" vs
  "different site" across a redirect chain.
- **Weighted signal scoring** — combining several weak, individually-noisy signals
  (shorteners, domain hops, chain length, protocol downgrade, open-redirect params)
  into one confidence score, rather than any single brittle rule.
- **Manifest V3 service workers** — event-driven, non-persistent background scripts;
  `importScripts()` for loading shared library code into the worker.
- **`chrome.storage.local`** — durable, async key-value storage that survives service
  worker restarts, vs. plain in-memory `Map` state which does not.
- **Shared scoring logic** (`lib/severity.js`) — background.js and popup.js both read
  the same thresholds instead of keeping their own copies that could silently drift.
- **Shadow DOM for style isolation** — the in-page warning banner is injected inside a
  shadow root so the host page's CSS can't override it (and vice versa).
- **`webNavigation` API** — redirect chain / lifecycle event tracking.
- **Message passing with responses** — `sendResponse()` lets content.js ask
  background.js "what's the verdict?" and act on the answer, not just fire-and-forget.

## Roadmap / next learning steps

- [ ] Move `PROTECTED_BRANDS` to a maintained top-N domain list (e.g. Tranco) fetched
      periodically instead of hardcoded.
- [ ] Swap the hand-picked `MULTI_PART_SUFFIXES` set for the real Public Suffix List.
- [ ] Add an options page for user-defined whitelists (false positives will happen).
- [ ] Explore integrating a real threat-intel API (e.g. Google Safe Browsing) as a second signal.
- [ ] Fix (or intentionally scope) the `normalizeHomoglyphs("modern")` false-positive
      caught by the test suite — e.g. only fold "rn"→"m" when the result then closely
      matches a known brand, not unconditionally.

## Monetization notes (v2, not yet built)

Chrome Web Store has no native paid-extension flow. If pursued later: freemium model
with a small backend (Stripe) gating a "pro" tier (e.g. live threat-intel feed), OR
treat this as an open-source credibility piece / lead magnet rather than a direct
revenue product.

## License

MIT
