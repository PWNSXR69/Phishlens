/**
 * popup.js
 * ---------------------------------------------------------
 * Handles both tabs: the live "Scan" view (current tab's
 * findings) and the persistent "History" view (read from
 * chrome.storage.local via the background worker).
 * ---------------------------------------------------------
 */

// ---------- Tab switching ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab + "Panel").classList.add("active");
    if (btn.dataset.tab === "history") loadHistory();
  });
});

// ---------- Scan panel ----------
const readoutEl = document.getElementById("readout");
const hostReadoutEl = document.getElementById("hostReadout");
const viewfinderEl = document.getElementById("viewfinder");
const findingsEl = document.getElementById("findings");
const statusDotEl = document.getElementById("statusDot");

function severityFromCount(items) {
  return items.length === 0 ? "safe" : items.length >= 2 ? "dangerous" : "suspicious";
}

chrome.runtime.sendMessage({ type: "GET_TAB_STATE" }, (state) => {
  if (!state) {
    readoutEl.textContent = "NO DATA";
    return;
  }

  const items = [];
  if (state.lookalike) {
    items.push(
      `Domain resembles <b>${state.lookalike.brand}</b> (${Math.round(state.lookalike.score * 100)}% match)`
    );
  }
  if (state.redirectFlag) {
    items.push(...state.redirectFlag.signals);
  }
  (state.formFindings || []).forEach((f) => items.push(f.detail));

  const severity = severityFromCount(items);
  const labels = { safe: "CLEAN", suspicious: "CAUTION", dangerous: "DANGER" };

  viewfinderEl.className = `viewfinder ${severity}`;
  statusDotEl.className = `status-dot ${severity}`;
  readoutEl.textContent = labels[severity];
  hostReadoutEl.textContent = state.hostname || "";

  findingsEl.innerHTML = items.length
    ? items.map((i) => `<li>${i}</li>`).join("")
    : `<li>No phishing indicators detected on this page.</li>`;
});

// ---------- History panel ----------
const historyListEl = document.getElementById("historyList");
const historyEmptyEl = document.getElementById("historyEmpty");
const clearBtn = document.getElementById("clearHistory");

function timeAgo(ts) {
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function severityFromScore(score) {
  return score >= 5 ? "dangerous" : score >= 2 ? "suspicious" : "safe";
}

function loadHistory() {
  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (history) => {
    history = history || [];
    historyEmptyEl.style.display = history.length ? "none" : "block";
    historyListEl.innerHTML = history
      .map((entry) => {
        const sev = severityFromScore(entry.score);
        return `
          <li class="history-row" title="${(entry.reasons || []).join(" | ")}">
            <span class="history-dot ${sev}"></span>
            <span class="history-host">${entry.hostname}</span>
            <span class="history-time">${timeAgo(entry.timestamp)}</span>
          </li>`;
      })
      .join("");
  });
}

clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, () => loadHistory());
});
