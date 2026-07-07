/**
 * background.js
 * ---------------------------------------------------------
 * The MV3 "service worker" — Chrome wakes it up for events
 * (navigation, messages) and can kill it between events. So
 * in-memory state (tabState) is fine for "this session" data,
 * but anything we want to SURVIVE a service worker restart or
 * browser relaunch (like history) must go into chrome.storage.
 *
 * IMPORTANT NAMING RULE (learned the hard way, twice): every
 * lib file loaded via importScripts() declares its functions in
 * THIS SAME global scope. Never `const someName = ...` using a
 * name that matches something a lib exports — always alias it
 * to something different, or you get a SyntaxError that kills
 * the whole service worker before it can register.
 * ---------------------------------------------------------
 */

importScripts("lib/domain.js");
importScripts("lib/redirect-analysis.js"); // depends on domain.js being loaded first
importScripts("lib/severity.js");          // depends on nothing else

const analyzeChain = self.PhishLensRedirect.analyzeRedirectChain;
const getSeverityScore = self.PhishLensSeverity.computeSeverity;
const getSeverityLabel = self.PhishLensSeverity.severityLabel;
const getReasons = self.PhishLensSeverity.buildReasons;

// tabId -> { chain: [url, ...], redirectFlag, lookalike, formFindings, hostname }
const tabState = new Map();

function getState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, { chain: [], lookalike: null, formFindings: [], redirectFlag: null });
  }
  return tabState.get(tabId);
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
  state.redirectFlag = analyzeChain(state.chain);
  updateBadge(details.tabId);
});

// ---------- Receive findings from content.js, respond with a verdict ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "PAGE_ANALYSIS") return;
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  const state = getState(tabId);
  state.lookalike = message.lookalike;
  state.formFindings = message.formFindings;
  state.hostname = message.hostname;

  updateBadge(tabId);
  recordHistoryEntry(tabId, state); // fire-and-forget async write, doesn't block the response below

  const score = getSeverityScore(state);
  const severity = getSeverityLabel(score);
  const reasons = getReasons(state);

  if (severity === "dangerous") {
    notifyDanger(state.hostname, reasons);
  }

  // Synchronous response — content.js uses this to decide whether
  // to show the in-page warning banner.
  sendResponse({ severity, reasons, score });
});

// ---------- Severity + badge ----------
function updateBadge(tabId) {
  const state = getState(tabId);
  const score = getSeverityScore(state);
  const label = getSeverityLabel(score);

  const BADGE_BY_LABEL = {
    safe: { text: "", color: "#4CAF50" },
    suspicious: { text: "!", color: "#F9A825" },
    dangerous: { text: "!!!", color: "#D32F2F" },
  };
  const { text, color } = BADGE_BY_LABEL[label];

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

// ---------- System notification for the worst cases ----------
function notifyDanger(hostname, reasons) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "PhishLens: Danger detected",
    message: `${hostname} — ${reasons[0] || "multiple phishing indicators found"}`,
    priority: 2,
  });
}

// ---------- Persistent history (chrome.storage.local) ----------
const HISTORY_KEY = "phishlens_history";
const MAX_HISTORY = 200;

async function recordHistoryEntry(tabId, state) {
  const score = getSeverityScore(state);
  const entry = {
    hostname: state.hostname,
    timestamp: Date.now(),
    score,
    reasons: getReasons(state),
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
    const state = tabId != null ? getState(tabId) : null;
    if (!state) return sendResponse(null);

    const score = getSeverityScore(state);
    sendResponse({
      ...state,
      severity: getSeverityLabel(score),
      reasons: getReasons(state),
    });
  });
  return true; // keep sendResponse alive for the async chrome.tabs.query
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
