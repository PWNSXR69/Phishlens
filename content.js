/**
 * content.js
 * ---------------------------------------------------------
 * Runs INSIDE the loaded webpage (in an "isolated world" —
 * it shares the DOM with the page's own JS, but not variables
 * or functions, so a malicious page's JS can't reach in and
 * tamper with our extension code).
 *
 * Three jobs:
 *  1. Check if the current domain looks like a brand impostor.
 *  2. Scan forms for credential fields posting somewhere shady.
 *  3. Report to background.js and, if it comes back "suspicious"
 *     or "dangerous", show an in-page warning banner.
 * ---------------------------------------------------------
 */

const getSimilarityScore = self.PhishLensSimilarity.similarityScore;
const normalizeHost = self.PhishLensSimilarity.normalizeHomoglyphs;
const TARGET_BRANDS = self.PhishLensBrands.PROTECTED_BRANDS;

// ---------- 1. Lookalike domain check ----------

function checkLookalikeDomain(hostname) {
  const normalizedHost = normalizeHost(hostname);
  let bestMatch = null;

  for (const brand of TARGET_BRANDS) {
    if (hostname === brand || hostname.endsWith("." + brand)) {
      return null; // it IS the brand, not a lookalike
    }

    const brandName = brand.split(".")[0];
    const hostNameOnly = normalizedHost.split(".")[0];
    const score = getSimilarityScore(hostNameOnly, brandName);

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

function inspectForms() {
  const findings = [];
  const forms = document.querySelectorAll("form");

  forms.forEach((form) => {
    const hasPasswordField = !!form.querySelector('input[type="password"]');
    if (!hasPasswordField) return;

    const action = form.getAttribute("action") || "";
    let actionHost = null;
    let isHttps = true;

    try {
      const actionUrl = new URL(action, window.location.href);
      actionHost = actionUrl.hostname;
      isHttps = actionUrl.protocol === "https:";
    } catch (e) {
      findings.push({ type: "malformed_action", detail: action });
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

// ---------- 3. In-page warning banner ----------
/**
 * LEARNING GOAL: Shadow DOM for style isolation.
 * We're injecting UI into a page we don't control. Without Shadow
 * DOM, the page's own CSS could stomp on our banner's styles (or
 * ours could stomp on the page's), the same isolation problem MV3
 * solves for JS contexts — this is the DOM/CSS equivalent of it.
 *
 * Deliberate design choice: this banner does NOT try to look like
 * a native Chrome/OS warning dialog. Spoofing a trusted system UI
 * is itself a phishing technique — so ours is clearly labeled as
 * coming from the PhishLens extension, with its own distinct look.
 */
function showWarningBanner(severity, reasons) {
  if (document.getElementById("phishlens-banner-host")) return; // don't double-inject

  const accent = severity === "dangerous" ? "#E2584F" : "#E0A63C";
  const label = severity === "dangerous"
    ? "PhishLens — Danger detected on this page"
    : "PhishLens — Use caution on this page";

  const host = document.createElement("div");
  host.id = "phishlens-banner-host";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .banner {
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
        display: flex; align-items: center; gap: 12px;
        padding: 10px 16px;
        background: #0B1330; color: #E9E7DF;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        border-bottom: 3px solid ${accent};
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      }
      .label { font-weight: 700; font-size: 13px; color: ${accent}; white-space: nowrap; }
      .reasons { flex: 1; font-size: 12.5px; line-height: 1.4; }
      button {
        background: none; border: 1px solid ${accent}; color: ${accent};
        border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px;
        flex-shrink: 0;
      }
      button:hover { background: ${accent}; color: #0B1330; }
    </style>
    <div class="banner">
      <span class="label">${label}</span>
      <span class="reasons">${reasons.slice(0, 2).join("  ·  ")}</span>
      <button type="button" id="phishlens-dismiss">Dismiss</button>
    </div>
  `;

  shadow.getElementById("phishlens-dismiss").addEventListener("click", () => host.remove());
}

// ---------- Report to background, act on its verdict ----------
chrome.runtime.sendMessage(
  {
    type: "PAGE_ANALYSIS",
    url: window.location.href,
    hostname: currentHost,
    lookalike: lookalikeResult,
    formFindings,
  },
  (response) => {
    if (response && (response.severity === "dangerous" || response.severity === "suspicious")) {
      showWarningBanner(response.severity, response.reasons);
    }
  }
);
