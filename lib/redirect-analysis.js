/**
 * redirect-analysis.js
 * ---------------------------------------------------------
 * "Functional core" — pure logic, zero Chrome API calls.
 * Takes an array of URL strings, returns a plain object or null.
 * Same input always produces the same output; nothing here reads
 * a tab, a cookie, or the network. That's exactly what makes it
 * cheap to unit test: no mocking, no fake browser environment,
 * just function-in, value-out.
 *
 * The Chrome-facing code (background.js) is the "imperative
 * shell" — it listens for real events and feeds this function
 * real data, but contains none of the actual decision logic
 * itself. Keeping that boundary clean is the single biggest
 * thing you can do to make browser-extension code testable.
 * ---------------------------------------------------------
 */

// NOTE: depends on domain.js already being loaded first (background.js
// controls that load order via importScripts). Local name deliberately
// differs from the global's own name — see background.js's comment on
// why redeclaring `getRegistrableDomain` here would throw.
const getDomain = globalThis.PhishLensDomain.getRegistrableDomain;

const KNOWN_SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at",
]);

// Query params that commonly carry an "open redirect" target —
// i.e. the site's own code forwards the visitor to whatever URL
// is in this param, which attackers abuse to hide behind a
// trusted domain for the first hop (e.g. trusted.com/go?url=evil.com).
const OPEN_REDIRECT_PARAMS = ["url", "redirect", "redirect_uri", "next", "dest", "destination", "continue", "u", "target"];

/**
 * LEARNING GOAL: redirects are suspicious in DEGREES, not
 * binary. A single redirect (naked domain -> www subdomain) is
 * completely normal. What we actually want is a SCORE built from
 * several independent signals, matching how Aegis's own HOT /
 * WARM / COLD scoring works — multiple weak signals compounding
 * into a strong verdict beats any single hard-coded rule.
 */
function analyzeRedirectChain(chain) {
  if (chain.length < 2) return null;

  const hosts = chain.map((u) => {
    try {
      return new URL(u);
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (hosts.length < 2) return null;

  const registrableDomains = hosts.map((u) => getDomain(u.hostname));
  const distinctDomains = new Set(registrableDomains);
  const finalHost = hosts[hosts.length - 1].hostname;

  const signals = [];
  let score = 0;

  // Signal 1: passed through a known shortener
  const shortenerHops = hosts.filter((u) => KNOWN_SHORTENERS.has(u.hostname));
  if (shortenerHops.length > 0) {
    score += 2;
    signals.push(`Passed through known URL shortener: ${shortenerHops.map(u => u.hostname).join(", ")}`);
  }

  // Signal 2: chain crosses multiple UNRELATED registrable domains.
  // (redirecting within the same site, e.g. paypal.com -> www.paypal.com,
  // is normal and should NOT count here — that's why we compare
  // registrable domains, not raw hostnames.)
  if (distinctDomains.size >= 3) {
    score += 2;
    signals.push(`Chain crossed ${distinctDomains.size} unrelated domains before landing`);
  } else if (distinctDomains.size === 2) {
    score += 1;
    signals.push(`Redirected from a different domain before landing on ${finalHost}`);
  }

  // Signal 3: long chain length is itself a mild red flag —
  // legitimate sites rarely need more than 1-2 hops.
  if (hosts.length >= 4) {
    score += 1;
    signals.push(`Unusually long redirect chain (${hosts.length} hops)`);
  }

  // Signal 4: protocol downgrade mid-chain (https -> http) — a
  // real man-in-the-middle / downgrade-style red flag.
  const downgraded = hosts.some((u, i) => i > 0 && hosts[i - 1].protocol === "https:" && u.protocol === "http:");
  if (downgraded) {
    score += 2;
    signals.push("Chain downgraded from HTTPS to HTTP partway through");
  }

  // Signal 5: open-redirect-style query params pointing at a
  // DIFFERENT domain than the one hosting them.
  for (const u of hosts) {
    for (const param of OPEN_REDIRECT_PARAMS) {
      const val = u.searchParams.get(param);
      if (!val) continue;
      try {
        const targetHost = new URL(val, u.href).hostname;
        if (getDomain(targetHost) !== getDomain(u.hostname)) {
          score += 1;
          signals.push(`Open-redirect-style parameter "${param}" pointed to a different domain (${targetHost})`);
        }
      } catch {
        // val wasn't a URL — ignore, not every "next=" param is a redirect target.
      }
    }
  }

  if (signals.length === 0) return null;
  return { score, signals, hops: registrableDomains, finalHost };
}

globalThis.PhishLensRedirect = { analyzeRedirectChain, KNOWN_SHORTENERS, OPEN_REDIRECT_PARAMS };
