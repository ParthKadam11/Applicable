import { describe, expect, it } from "vitest";
import { slugGuesses } from "../../src/discover/slug-guess.js";

describe("slugGuesses", () => {
  it("uses domain base and cleaned name", () => {
    const guesses = slugGuesses("PostHog Inc", "posthog.com");
    expect(guesses).toContain("posthog");
  });

  it("handles multi-word names", () => {
    const guesses = slugGuesses("Grafana Labs", "grafana.com");
    expect(guesses.some((g) => g.includes("grafana"))).toBe(true);
  });
});
