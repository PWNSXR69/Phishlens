/**
 * domain.test.js
 * ---------------------------------------------------------
 * These assertions were checked against the ACTUAL function
 * output first (not assumed), then written into the test.
 * That's the right order for any test you write against code
 * you didn't just derive on paper: run it, observe the real
 * behavior, THEN encode that behavior as an assertion — rather
 * than guessing what "should" happen and being surprised later.
 * ---------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import "../lib/domain.js";

const { getRegistrableDomain } = globalThis.PhishLensDomain;

describe("getRegistrableDomain", () => {
  it("strips a subdomain down to the registrable domain", () => {
    expect(getRegistrableDomain("checkout.paypal.com")).toBe("paypal.com");
  });

  it("leaves an already-bare domain unchanged", () => {
    expect(getRegistrableDomain("paypal.com")).toBe("paypal.com");
  });

  it("leaves a single-label host unchanged (e.g. localhost)", () => {
    expect(getRegistrableDomain("localhost")).toBe("localhost");
  });

  it("returns empty string unchanged (no crash on empty input)", () => {
    expect(getRegistrableDomain("")).toBe("");
  });

  describe("multi-part public suffixes (the co.uk problem)", () => {
    it("keeps 3 labels for a known multi-part suffix like co.uk", () => {
      // This is the case that a naive `split('.').slice(-2)` gets
      // WRONG — it would return "co.uk" here, which is a shared
      // public suffix, not anyone's actual registrable domain.
      expect(getRegistrableDomain("attacker.co.uk")).toBe("attacker.co.uk");
    });

    it("correctly reduces a deeper subdomain under co.uk", () => {
      expect(getRegistrableDomain("mail.google.co.uk")).toBe("google.co.uk");
    });

    it("KNOWN LIMITATION: a bare multi-part suffix has no registrable label to return", () => {
      // "co.uk" on its own isn't a real registrable domain (nobody
      // owns just "co.uk") but our simplified function has nothing
      // else to fall back to, so it returns the suffix itself. The
      // real Public Suffix List handles this correctly; our seed
      // list does not — documented here rather than silently wrong.
      expect(getRegistrableDomain("co.uk")).toBe("co.uk");
    });
  });

  describe("platform suffixes (github.io, vercel.app, etc.)", () => {
    it("treats each github.io subdomain as its own registrable site", () => {
      // This matters because on platforms like github.io, different
      // subdomains belong to different, unrelated account owners —
      // "alice.github.io" and "bob.github.io" are NOT the same site,
      // unlike "mail.google.com" and "drive.google.com".
      expect(getRegistrableDomain("user.github.io")).toBe("user.github.io");
    });

    it("handles a deeper chain under a platform suffix by keeping only 3 labels", () => {
      // A documented simplification: real deployments can have more
      // than one subdomain level (e.g. preview branches on Vercel),
      // and our 3-label rule only looks at the last 3 — good enough
      // for a portfolio demo, a gap worth knowing about in production.
      expect(getRegistrableDomain("a.b.c.vercel.app")).toBe("c.vercel.app");
    });
  });
});
