/**
 * redirect-analysis.test.js
 * ---------------------------------------------------------
 * Notice what's absent here: no `chrome.webNavigation` mock,
 * no fake tab, no fake browser at all. `analyzeRedirectChain`
 * takes an array of URL strings and returns a plain object —
 * that's the entire interface. This is the payoff of pulling
 * it out of background.js: the harder-sounding test turned out
 * to need LESS setup than the earlier ones, because the function
 * itself has no side effects to fake.
 * ---------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import "../lib/domain.js"; // must load first — redirect-analysis.js reads globalThis.PhishLensDomain at import time
import "../lib/redirect-analysis.js";

const { analyzeRedirectChain } = globalThis.PhishLensRedirect;

describe("analyzeRedirectChain", () => {
  it("returns null for a chain with fewer than 2 URLs", () => {
    expect(analyzeRedirectChain([])).toBeNull();
    expect(analyzeRedirectChain(["https://paypal.com"])).toBeNull();
  });

  it("returns null for a normal same-site chain (naked domain -> www)", () => {
    const chain = ["https://paypal.com", "https://www.paypal.com"];
    expect(analyzeRedirectChain(chain)).toBeNull();
  });

  it("ignores unparseable URLs rather than crashing", () => {
    const chain = ["not a url", "also not a url"];
    expect(analyzeRedirectChain(chain)).toBeNull();
  });

  it("flags a chain that passes through a known shortener", () => {
    const chain = ["https://bit.ly/abc123", "https://totally-legit-bank.com"];
    const result = analyzeRedirectChain(chain);
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.signals.some((s) => s.includes("shortener"))).toBe(true);
  });

  it("flags a chain crossing 3+ unrelated domains higher than crossing 2", () => {
    const twoHop = analyzeRedirectChain(["https://siteA.com", "https://siteB.com"]);
    const threeHop = analyzeRedirectChain([
      "https://siteA.com", "https://siteB.com", "https://siteC.com",
    ]);
    expect(threeHop.score).toBeGreaterThan(twoHop.score);
  });

  it("does NOT flag domain-hopping when hops share a registrable domain", () => {
    // checkout.paypal.com -> login.paypal.com -> www.paypal.com is
    // 3 hostnames but ONE registrable domain — this must NOT trigger
    // the "crossed unrelated domains" signal. This is the exact case
    // the co.uk-aware getRegistrableDomain() exists to get right.
    const chain = [
      "https://checkout.paypal.com",
      "https://login.paypal.com",
      "https://www.paypal.com",
    ];
    expect(analyzeRedirectChain(chain)).toBeNull();
  });

  it("flags an HTTPS -> HTTP downgrade mid-chain", () => {
    const chain = ["https://example.com/go", "http://example.com/landing"];
    const result = analyzeRedirectChain(chain);
    expect(result).not.toBeNull();
    expect(result.signals.some((s) => s.includes("downgraded"))).toBe(true);
  });

  it("flags an open-redirect-style query param pointing off-domain", () => {
    const chain = [
      "https://trusted-mailer.com/click?url=https://evil-phish.ru/login",
      "https://evil-phish.ru/login",
    ];
    const result = analyzeRedirectChain(chain);
    expect(result).not.toBeNull();
    expect(result.signals.some((s) => s.includes("Open-redirect-style"))).toBe(true);
  });

  it("does NOT flag a redirect param pointing to the SAME domain", () => {
    const chain = [
      "https://example.com/go?next=https://example.com/dashboard",
      "https://example.com/dashboard",
    ];
    // same-site chain overall + same-site param target = nothing to flag
    expect(analyzeRedirectChain(chain)).toBeNull();
  });

  it("compounds multiple signals into a higher score than any single one", () => {
    // shortener AND a domain hop AND a downgrade, all in one chain
    const chain = [
      "https://bit.ly/xyz",
      "http://intermediate-tracker.com",
      "https://final-phish-site.tk",
    ];
    const result = analyzeRedirectChain(chain);
    const shortenerOnly = analyzeRedirectChain(["https://bit.ly/xyz", "https://safe-site.com"]);
    expect(result.score).toBeGreaterThan(shortenerOnly.score);
  });
});
