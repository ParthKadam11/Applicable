import { describe, expect, it, vi } from "vitest";
import { classifyJobContent } from "../../src/classify/classify.js";
import type { LlmProvider } from "../../src/classify/llm/provider.js";

describe("classifyJobContent LLM merge", () => {
  it("calls LLM when rules are unclear and merges validated JSON", async () => {
    const evidence = "Team members work across EMEA and LATAM time zones.";
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      classify: vi.fn().mockResolvedValue({
        india_eligibility: "region_locked",
        eligibility_evidence: [evidence],
        remote_scope: "region",
        seniority: "mid",
        role_family: "backend",
      }),
    };

    // Bare remote → rules unclear → LLM should run
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
    expect(tag.classifier).toBe("llm");
    expect(tag.model).toBe("mock:mock-1");
    expect(tag.india_eligibility).toBe("region_locked");
    expect(tag.eligibility_evidence[0]).toBe(evidence);
  });

  it("retries once on invalid LLM JSON then keeps rules result", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      classify: vi
        .fn()
        .mockResolvedValueOnce({ nope: true })
        .mockResolvedValueOnce({ still: "bad" }),
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

    expect(provider.classify).toHaveBeenCalledTimes(2);
    expect(tag.classifier).toBe("rules");
    expect(tag.india_eligibility).toBe("unclear");
  });

  it("rejects LLM evidence that is not in the posting", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
      classify: vi.fn().mockResolvedValue({
        india_eligibility: "open",
        eligibility_evidence: ["We hire anyone on Earth including Antarctica."],
        remote_scope: "worldwide",
        seniority: "unknown",
        role_family: "other",
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

  it("skips LLM when rulesOnly is set", async () => {
    const provider: LlmProvider = {
      name: "mock",
      model: "mock-1",
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
