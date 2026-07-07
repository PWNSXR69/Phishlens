/**
 * severity.js
 * ---------------------------------------------------------
 * Previously, "what score counts as dangerous?" was decided in
 * TWO places that could silently drift apart: background.js's
 * badge logic and popup.js's own copy. Centralizing it here
 * means both contexts (service worker + popup window) read the
 * exact same rule.
 *
 * This is also a pure function — no chrome.* calls — so it's
 * unit-testable the same way as the redirect-analysis logic.
 * ---------------------------------------------------------
 */

function computeSeverity(state) {
  let score = 0;
  if (state.lookalike) score += 3;
  if (state.redirectFlag) score += state.redirectFlag.score;
  if (state.formFindings?.some((f) => f.type === "cross_domain_form")) score += 3;
  if (state.formFindings?.some((f) => f.type === "insecure_form")) score += 2;
  return score;
}

function severityLabel(score) {
  if (score >= 5) return "dangerous";
  if (score >= 2) return "suspicious";
  return "safe";
}

function buildReasons(state) {
  return [
    ...(state.lookalike
      ? [`Domain resembles ${state.lookalike.brand} (${Math.round(state.lookalike.score * 100)}% match)`]
      : []),
    ...(state.redirectFlag ? state.redirectFlag.signals : []),
    ...(state.formFindings || []).map((f) => f.detail),
  ];
}

globalThis.PhishLensSeverity = { computeSeverity, severityLabel, buildReasons };
