/**
 * background.js
 * ---------------------------------------------------------
 * The MV3 "service worker" — Chrome wakes it up for events
 * (navigation, messages) and can kill it between events. So
 * in-memory state (tabState) is fine for "this session" data,
 * but anything we want to SURVIVE a service worker restart or
 * browser relaunch (like history) must go into chrome.storage.
 * ---------------------------------------------------------
 */

importScripts("lib/domain.js");
// NOTE: domain.js declares a top-level `function getRegistrableDomain`.
// importScripts() runs it in this SAME global scope (classic scripts,
// not ES modules), so re-declaring that exact identifier here — even
// via destructuring — throws a SyntaxError. We give it a different
// local name and call through the namespace object instead.
const getDomain = self.PhishLensDomain.getRegistrableDomain;

// tabId -> { chain: [url, ...], redirectFlag, lookalike, formFindings, hostname }
const tabState = new Map();

function getState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, { chain: [], lookalike: null, formFindings: [], redirectFlag: null });
  }
  return tabState.get(tabId);
}

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

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  const state = getState(details.tabId);
  state.chain.push(details.url);
  if (state.chain.length > 20) state.chain.shift();
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  const state = getState(details.tabId);
  state.redirectFlag = analyzeRedirectChain(state.chain);
  updateBadge(details.tabId);
});

// ---------- Receive findings from content.js ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "PAGE_ANALYSIS") return;
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  const state = getState(tabId);
  state.lookalike = message.lookalike;
  state.formFindings = message.formFindings;
  state.hostname = message.hostname;

  updateBadge(tabId);
  recordHistoryEntry(tabId, state);
});

// ---------- Severity + badge ----------
function computeSeverity(state) {
  let score = 0;
  if (state.lookalike) score += 3;
  if (state.redirectFlag) score += state.redirectFlag.score;
  if (state.formFindings?.some((f) => f.type === "cross_domain_form")) score += 3;
  if (state.formFindings?.some((f) => f.type === "insecure_form")) score += 2;
  return score;
}

function updateBadge(tabId) {
  const state = getState(tabId);
  const score = computeSeverity(state);

  let text = "";
  let color = "#4CAF50";
  if (score >= 5) {
    text = "!!!";
    color = "#D32F2F";
  } else if (score >= 2) {
    text = "!";
    color = "#F9A825";
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

// ---------- Persistent history (chrome.storage.local) ----------
const HISTORY_KEY = "phishlens_history";
const MAX_HISTORY = 200;

async function recordHistoryEntry(tabId, state) {
  const score = computeSeverity(state);
  const entry = {
    hostname: state.hostname,
    timestamp: Date.now(),
    score,
    reasons: [
      ...(state.lookalike ? [`Lookalike of ${state.lookalike.brand}`] : []),
      ...(state.redirectFlag ? state.redirectFlag.signals : []),
      ...(state.formFindings || []).map((f) => f.detail),
    ],
  };

  const { [HISTORY_KEY]: existing = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const updated = [entry, ...existing].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: updated });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_TAB_STATE") return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    sendResponse(tabId != null ? getState(tabId) : null);
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "GET_HISTORY") return;
  chrome.storage.local.get(HISTORY_KEY).then(({ [HISTORY_KEY]: history = [] }) => {
    sendResponse(history);
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CLEAR_HISTORY") return;
  chrome.storage.local.set({ [HISTORY_KEY]: [] }).then(() => sendResponse(true));
  return true;
});
