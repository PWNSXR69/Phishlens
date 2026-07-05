/**
 * content.js
 * ---------------------------------------------------------
 * Runs INSIDE the loaded webpage (in an "isolated world" —
 * it shares the DOM with the page's own JS, but not variables
 * or functions, so a malicious page's JS can't reach in and
 * tamper with our extension code).
 *
 * Two jobs:
 *  1. Check if the current domain looks like a brand impostor.
 *  2. Scan forms for credential fields posting somewhere shady.
 * ---------------------------------------------------------
 */

const { similarityScore, normalizeHomoglyphs } = self.PhishLensSimilarity;
const { PROTECTED_BRANDS } = self.PhishLensBrands;

// ---------- 1. Lookalike domain check ----------

function checkLookalikeDomain(hostname) {
  const normalizedHost = normalizeHomoglyphs(hostname);
  let bestMatch = null;

  for (const brand of PROTECTED_BRANDS) {
    // Exact match or subdomain of the real brand = totally fine,
    // skip it. (paypal.com and checkout.paypal.com are legit.)
    if (hostname === brand || hostname.endsWith("." + brand)) {
      return null; // not a lookalike, it IS the brand
    }

    const brandName = brand.split(".")[0]; // "paypal" from "paypal.com"
    const hostNameOnly = normalizedHost.split(".")[0];

    const score = similarityScore(hostNameOnly, brandName);

    // High similarity but NOT an exact match is exactly the
    // phishing pattern: close enough to fool a skim-reader,
    // different enough to be a different, attacker-owned domain.
    if (score >= 0.75 && score < 1) {
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { brand, score };
      }
    }
  }

  return bestMatch;
}

const currentHost = window.location.hostname;
const lookalikeResult = checkLookalikeDomain(currentHost);

// ---------- 2. Credential form inspection ----------

/**
 * LEARNING GOAL: why we check form.action, not just the page URL.
 * A phishing page can be hosted ANYWHERE and still look legit
 * (copy-pasted HTML/CSS from the real site), but the <form>
 * has to point somewhere the attacker actually controls to
 * receive stolen credentials. That form action URL is often
 * the biggest tell — it frequently doesn't match the page's
 * own domain at all.
 */
function inspectForms() {
  const findings = [];
  const forms = document.querySelectorAll("form");

  forms.forEach((form) => {
    const hasPasswordField = !!form.querySelector('input[type="password"]');
    if (!hasPasswordField) return; // only care about credential forms

    const action = form.getAttribute("action") || "";
    let actionHost = null;
    let isHttps = true;

    try {
      // A relative action ("/login") resolves against the current
      // page, which is what we want to compare against.
      const actionUrl = new URL(action, window.location.href);
      actionHost = actionUrl.hostname;
      isHttps = actionUrl.protocol === "https:";
    } catch (e) {
      // Malformed action attribute — worth flagging on its own.
      findings.push({
        type: "malformed_action",
        detail: action,
      });
      return;
    }

    const crossDomain = actionHost !== currentHost;
    const insecure = !isHttps;

    if (crossDomain) {
      findings.push({
        type: "cross_domain_form",
        detail: `Form submits credentials to "${actionHost}" while page is "${currentHost}"`,
      });
    }
    if (insecure) {
      findings.push({
        type: "insecure_form",
        detail: `Form submits credentials over unencrypted HTTP to "${actionHost}"`,
      });
    }
  });

  return findings;
}

const formFindings = inspectForms();

// ---------- Report back to the background service worker ----------
// Content scripts can't easily persist state or coordinate across
// tabs, so we hand everything off to the background script, which
// is the long-lived "brain" of the extension.
chrome.runtime.sendMessage({
  type: "PAGE_ANALYSIS",
  url: window.location.href,
  hostname: currentHost,
  lookalike: lookalikeResult,
  formFindings,
});
