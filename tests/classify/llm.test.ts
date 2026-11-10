import { describe, expect, it, vi } from "vitest";
import {
  classifyJobContent,
  retryAfterMsFromError,
} from "../../src/classify/classify.js";
import { buildEligibilitySnippet } from "../../src/classify/llm/snippet.js";
import type { LlmProvider } from "../../src/classify/llm/provider.js";
import {
  isDailyLimitError,
  isRateLimitError,
} from "../../src/classify/llm/errors.js";

describe("buildEligibilitySnippet", () => {
  it("keeps title, location, and keyword sentences under 1500 chars", () => {
    const long = "Filler sentence about culture. ".repeat(80);
    const snippet = buildEligibilitySnippet({
      title: "Engineer",
      locationRaw: "Remote",
      descriptionText: `${long} Candidates must be based in the US. ${long} Visa sponsorship not available.`,
    });
    expect(snippet).toContain("Title: Engineer");
    expect(snippet).toContain("Location: Remote");
    expect(snippet).toMatch(/based in the US/i);
    expect(snippet.length).toBeLessThanOrEqual(1500);
    expect(snippet).not.toContain("Filler sentence about culture.".repeat(10));
  });
});

describe("rate limit helpers", () => {
  it("parses Groq retry-after including minutes", () => {
    expect(
      retryAfterMsFromError(
        "Rate limit reached. Please try again in 6.5325s. Need more tokens?",
      ),
    ).toBe(6783);
    expect(
      retryAfterMsFromError(
        "Please try again in 6m53.424s. Need more tokens?",
      ),
    ).toBe(413674);
  });

  it("detects daily vs RPM limits", () => {
    expect(
      isDailyLimitError("Rate limit: TPD exceeded. try again in 16m7s", 967_000),
    ).toBe(true);
    expect(isDailyLimitError("Please try again in 2.5s", 2750)).toBe(false);
    expect(isRateLimitError("Groq HTTP 429: rate limit")).toBe(true);
  });
});

describe("classifyJobContent LLM merge", () => {
  it("calls LLM when rules are unclear and merges validated JSON", async () => {
    const evidence = "Team members work across EMEA and LATAM time zones.";
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi.fn().mockResolvedValue({
        india_eligibility: "region_locked",
        eligibility_evidence: [evidence],
        remote_scope: "region",
      }),
    };

    const tag = await classifyJobContent(
      {
        title: "Software Developer",
        descriptionText: `Remote-friendly role. ${evidence}`,
        locationRaw: "Remote",
        contentHash: "abc",
      },
      { llm: provider },
    );

    expect(provider.classify).toHaveBeenCalledOnce();
    const callArg = vi.mocked(provider.classify).mock.calls[0]![0];
    expect(callArg.snippet).toBeTruthy();
    expect(callArg.snippet!.length).toBeLessThanOrEqual(1500);
    expect(tag.classifier).toBe("llm");
    expect(tag.model).toBe("mock:mock-1");
    expect(tag.india_eligibility).toBe("region_locked");
    expect(tag.eligibility_evidence[0]).toBe(evidence);
  });

  it("skips LLM when rules are confident", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi.fn(),
    };

    const tag = await classifyJobContent(
      {
        title: "Engineer",
        descriptionText: "Work from anywhere. Great benefits.",
        locationRaw: "Worldwide",
        contentHash: "skip",
      },
      { llm: provider },
    );

    expect(provider.classify).not.toHaveBeenCalled();
    expect(tag.classifier).toBe("rules");
    expect(tag.india_eligibility).toBe("open");
  });

  it("retries invalid LLM JSON then keeps rules result", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi
        .fn()
        .mockResolvedValueOnce({ nope: true })
        .mockResolvedValueOnce({ still: "bad" })
        .mockResolvedValueOnce({ also: "bad" }),
    };

    const tag = await classifyJobContent(
      {
        title: "Engineer",
        descriptionText: "Remote position. Join us.",
        locationRaw: "Remote",
        contentHash: "def",
      },
      { llm: provider },
    );

    expect(provider.classify).toHaveBeenCalledTimes(3);
    expect(tag.classifier).toBe("rules");
    expect(tag.india_eligibility).toBe("unclear");
  });

  it("rejects LLM evidence that is not in the posting", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi.fn().mockResolvedValue({
        india_eligibility: "open",
        eligibility_evidence: ["We hire anyone on Earth including Antarctica."],
        remote_scope: "worldwide",
      }),
    };

    const tag = await classifyJobContent(
      {
        title: "Engineer",
        descriptionText: "Remote position with flexible hours.",
        locationRaw: "Remote",
        contentHash: "ghi",
      },
      { llm: provider },
    );

    expect(tag.india_eligibility).toBe("unclear");
    expect(tag.eligibility_evidence).toEqual([]);
  });

  it("waits and retries on HTTP 429 then succeeds", async () => {
    vi.useFakeTimers();
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            'Groq HTTP 429: {"error":{"message":"Please try again in 0.05s."}}',
          ),
        )
        .mockResolvedValueOnce({
          india_eligibility: "unclear",
          eligibility_evidence: [],
          remote_scope: "unknown",
        }),
    };

    const pending = classifyJobContent(
      {
        title: "Engineer",
        descriptionText: "Remote position.",
        locationRaw: "Remote",
        contentHash: "rate",
      },
      { llm: provider },
    );

    await vi.advanceTimersByTimeAsync(500);
    const tag = await pending;
    expect(provider.classify).toHaveBeenCalledTimes(2);
    expect(tag.classifier).toBe("llm");
    vi.useRealTimers();
  });

  it("skips LLM when rulesOnly is set", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      isConfigured: () => true,
      classify: vi.fn(),
    };

    const tag = await classifyJobContent(
      {
        title: "Engineer",
        descriptionText: "Remote position.",
        locationRaw: null,
        contentHash: "jkl",
      },
      { llm: provider, rulesOnly: true },
    );

    expect(provider.classify).not.toHaveBeenCalled();
    expect(tag.classifier).toBe("rules");
  });
});
