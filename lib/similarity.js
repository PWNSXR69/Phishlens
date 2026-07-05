/**
 * similarity.js
 * ---------------------------------------------------------
 * LEARNING GOAL: Levenshtein (edit) distance.
 *
 * Definition: the minimum number of single-character edits
 * (insertions, deletions, substitutions) needed to turn one
 * string into another.
 *
 *   levenshtein("paypal", "paypa1") === 1   // one substitution
 *   levenshtein("paypal", "paypall") === 1  // one insertion
 *   levenshtein("paypal", "payppal") === 1  // one insertion
 *
 * Why this matters for phishing detection:
 * Attackers register domains that are ONE edit away from a
 * trusted brand, because it's cheap to register and easy for
 * a rushed human eye to miss: paypa1.com, paypall.com, micros0ft.com.
 *
 * This is a classic Dynamic Programming problem. We build a
 * table where cell [i][j] = edit distance between the first
 * i characters of string A and the first j characters of
 * string B. Each cell depends only on 3 neighbours (left,
 * top, top-left), so we can fill it row by row.
 * ---------------------------------------------------------
 */

/**
 * Compute the Levenshtein distance between two strings.
 * Time complexity: O(m * n)   Space complexity: O(m * n)
 * (there's an O(min(m,n)) space version, but the full table
 * is easier to reason about while learning — optimize later
 * as an exercise once this works.)
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;

  // dp[i][j] = edit distance between a[0..i) and b[0..j)
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  // Base cases: turning "" into b[0..j) costs j insertions,
  // turning a[0..i) into "" costs i deletions.
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        // Characters match — no edit needed here, inherit
        // the answer from the diagonal (both strings shorter by 1).
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion (remove a char from a)
          dp[i][j - 1],     // insertion (add a char to a)
          dp[i - 1][j - 1]  // substitution (swap a char)
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalized similarity score in [0, 1], where 1 = identical.
 * Useful because raw edit distance isn't comparable across
 * different-length strings (distance of 2 means very different
 * things for "abc" vs "internationalization").
 */
function similarityScore(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

/**
 * LEARNING GOAL: Homoglyph / character-substitution detection.
 *
 * Levenshtein alone misses tricks where visually-similar
 * characters replace real ones: "0" for "o", "1" or "l" for
 * "l", "rn" for "m". We normalize common substitutions BEFORE
 * running Levenshtein, so "micr0soft" becomes "microsoft" and
 * scores as an exact match (a huge red flag: identical after
 * normalization but not identical as typed).
 */
const HOMOGLYPH_MAP = {
  "0": "o",
  "1": "l",
  "3": "e",
  "5": "s",
  "8": "b",
  "@": "a",
  "$": "s",
  "rn": "m", // two characters standing in for one — handled separately below
};

function normalizeHomoglyphs(str) {
  let s = str.toLowerCase();
  s = s.split("rn").join("m"); // multi-char substitution first
  return s
    .split("")
    .map((ch) => HOMOGLYPH_MAP[ch] || ch)
    .join("");
}

// Export for use in background.js / content.js (both loaded as
// plain scripts here, so we just attach to a shared namespace
// instead of using ES modules — MV3 content scripts loaded via
// the "js" array run in the same scope in the order listed).
// We use globalThis rather than self/window here specifically so
// this same file can also be require()'d directly in Node during
// unit tests — self/window don't exist there, globalThis does.
globalThis.PhishLensSimilarity = {
  levenshtein,
  similarityScore,
  normalizeHomoglyphs,
};
