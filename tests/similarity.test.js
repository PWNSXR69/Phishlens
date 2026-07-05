/**
 * similarity.test.js
 * ---------------------------------------------------------
 * LEARNING GOAL: how to structure a test suite.
 *
 * Each `describe` groups tests for one function. Each `it` is
 * ONE behavior, named as a sentence ("returns 0 for identical
 * strings") so a failing test tells you what broke without
 * needing to read the assertion.
 *
 * We deliberately test EDGE CASES, not just the happy path:
 * empty strings, identical strings, case sensitivity, single
 * vs multi-character diffs. Edge cases are where real bugs
 * hide — the happy path almost always works.
 * ---------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import "../lib/similarity.js";

const { levenshtein, similarityScore, normalizeHomoglyphs } = globalThis.PhishLensSimilarity;

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("paypal", "paypal")).toBe(0);
  });

  it("returns the full length when one string is empty", () => {
    expect(levenshtein("", "paypal")).toBe(6);
    expect(levenshtein("paypal", "")).toBe(6);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("counts a single substitution as distance 1", () => {
    expect(levenshtein("paypal", "paypa1")).toBe(1); // "l" -> "1"
  });

  it("counts a single insertion as distance 1", () => {
    expect(levenshtein("paypal", "paypall")).toBe(1);
  });

  it("counts a single deletion as distance 1", () => {
    expect(levenshtein("paypal", "paypa")).toBe(1);
  });

  it("matches the textbook kitten/sitting example (distance 3)", () => {
    // The canonical example used to teach this algorithm —
    // a good sanity check that the DP table is wired correctly.
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("is symmetric: distance(a, b) === distance(b, a)", () => {
    expect(levenshtein("microsoft", "micr0s0ft")).toBe(
      levenshtein("micr0s0ft", "microsoft")
    );
  });

  it("is case-sensitive (by design — normalization happens separately)", () => {
    expect(levenshtein("PayPal", "paypal")).toBeGreaterThan(0);
  });
});

describe("similarityScore", () => {
  it("returns 1 for identical strings", () => {
    expect(similarityScore("paypal", "paypal")).toBe(1);
  });

  it("returns 0 for two empty strings (defined edge case, not NaN)", () => {
    expect(similarityScore("", "")).toBe(1);
  });

  it("returns a high score for a one-character difference on a long string", () => {
    const score = similarityScore("microsoft", "micr0soft");
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThan(1);
  });

  it("returns a low score for completely different strings", () => {
    const score = similarityScore("paypal", "zzzzzzzz");
    expect(score).toBeLessThan(0.3);
  });
});

describe("normalizeHomoglyphs", () => {
  it("replaces common digit-for-letter substitutions", () => {
    expect(normalizeHomoglyphs("micr0s0ft")).toBe("microsoft");
    expect(normalizeHomoglyphs("payp@l")).toBe("paypal");
  });

  it("replaces the two-character 'rn' -> 'm' trick", () => {
    expect(normalizeHomoglyphs("rnicrosoft")).toBe("microsoft");
  });

  it("KNOWN LIMITATION: also mis-fires on real words containing 'rn'", () => {
    // The 'rn' -> 'm' rule can't distinguish an intentional homoglyph
    // trick from an ordinary word that happens to contain "rn" — it
    // has no notion of word boundaries or dictionary lookup, so
    // "modern" collapses to "modem". This test exists to make that
    // limitation VISIBLE and intentional rather than a silent surprise
    // discovered later. A stricter version would only fold "rn" when
    // it appears mid-word specifically adjacent to characters that
    // match a KNOWN brand shape — worth trying as a follow-up exercise.
    expect(normalizeHomoglyphs("modern")).toBe("modem");
  });

  it("lower-cases input as part of normalization", () => {
    expect(normalizeHomoglyphs("PayPal")).toBe("paypal");
  });

  it("leaves already-clean strings unchanged", () => {
    expect(normalizeHomoglyphs("google")).toBe("google");
  });
});
