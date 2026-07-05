/**
 * domain.js
 * ---------------------------------------------------------
 * LEARNING GOAL: why "just split on dots" breaks for real domains.
 *
 * naive approach: hostname.split(".").slice(-2).join(".")
 * works for "checkout.paypal.com" -> "paypal.com"  (correct)
 * but FAILS for "attacker.co.uk"  -> "co.uk"        (wrong! that's
 *   a public suffix, not a real registrable domain)
 * and for "mail.google.co.uk"    -> "co.uk"         (wrong)
 *
 * The real fix is the "Public Suffix List" (publicsuffix.org) —
 * a maintained list of every suffix a registrar treats as "public"
 * (com, co.uk, github.io, etc). Browsers, cookie policies, and TLS
 * cert issuance all rely on it. For this project we ship a small
 * hand-picked subset covering common cases, which is enough to
 * demo the CONCEPT correctly — flag this as a known simplification
 * in the README rather than pretending it's complete.
 * ---------------------------------------------------------
 */

// A small seed of two-part public suffixes. Anything not in this
// set is assumed to be a normal single-part TLD (.com, .org, .io...).
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk",
  "co.jp", "co.in", "co.nz", "co.za", "com.au", "net.au",
  "com.br", "com.mx", "com.sg", "co.kr",
  "github.io", "pages.dev", "web.app", "vercel.app", "netlify.app",
]);

function getRegistrableDomain(hostname) {
  if (!hostname) return hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;

  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");

  // If the last two labels are themselves a known public suffix
  // (like "co.uk"), the registrable domain needs THREE labels
  // ("attacker.co.uk"), not two ("co.uk").
  if (MULTI_PART_SUFFIXES.has(lastTwo)) {
    return parts.length >= 3 ? lastThree : lastTwo;
  }
  return lastTwo;
}

globalThis.PhishLensDomain = { getRegistrableDomain };
