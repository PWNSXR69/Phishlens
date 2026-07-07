import { describe, it, expect } from "vitest";
import "../lib/severity.js";

const { computeSeverity, severityLabel, buildReasons } = globalThis.PhishLensSeverity;

describe("severityLabel", () => {
  it("labels score 0 and 1 as safe", () => {
    expect(severityLabel(0)).toBe("safe");
    expect(severityLabel(1)).toBe("safe");
  });

  it("labels score 2-4 as suspicious", () => {
    expect(severityLabel(2)).toBe("suspicious");
    expect(severityLabel(4)).toBe("suspicious");
  });

  it("labels score 5+ as dangerous", () => {
    expect(severityLabel(5)).toBe("dangerous");
    expect(severityLabel(9)).toBe("dangerous");
  });
});

describe("computeSeverity", () => {
  it("returns 0 for an empty state", () => {
    expect(computeSeverity({})).toBe(0);
  });

  it("adds 3 for a lookalike domain match", () => {
    expect(computeSeverity({ lookalike: { brand: "paypal.com", score: 0.9 } })).toBe(3);
  });

  it("adds the redirect flag's own score", () => {
    expect(computeSeverity({ redirectFlag: { score: 4, signals: [] } })).toBe(4);
  });

  it("compounds cross-domain (+3) and insecure (+2) form findings to 5 (dangerous)", () => {
    const state = {
      formFindings: [{ type: "cross_domain_form" }, { type: "insecure_form" }],
    };
    expect(computeSeverity(state)).toBe(5);
    expect(severityLabel(computeSeverity(state))).toBe("dangerous");
  });
});

describe("buildReasons", () => {
  it("returns an empty array for a clean state", () => {
    expect(buildReasons({})).toEqual([]);
  });

  it("includes the brand and match percentage for a lookalike", () => {
    const reasons = buildReasons({ lookalike: { brand: "paypal.com", score: 0.86 } });
    expect(reasons[0]).toContain("paypal.com");
    expect(reasons[0]).toContain("86%");
  });

  it("includes redirect signals and form finding details together", () => {
    const state = {
      redirectFlag: { signals: ["Passed through known URL shortener: bit.ly"] },
      formFindings: [{ detail: "Form submits credentials to a different domain" }],
    };
    const reasons = buildReasons(state);
    expect(reasons).toHaveLength(2);
    expect(reasons).toContain("Passed through known URL shortener: bit.ly");
    expect(reasons).toContain("Form submits credentials to a different domain");
  });
});
