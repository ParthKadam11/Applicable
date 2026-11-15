import { z } from "zod";
import { createLlmProvider } from "../classify/llm/index.js";
import { normalizeWhitespace } from "../classify/text.js";
import { assertFactEvidence } from "./evidence.js";
import type { ExtractedFact, SourceKind } from "./types.js";

const LlmFactSchema = z.object({
  facts: z
    .array(
      z.object({
        fact_type: z.enum([
          "hq",
          "founded_year",
          "team_size",
          "founder",
          "investor",
          "batch",
          "industry",
          "tag",
          "one_liner",
        ]),
        value: z.string(),
        quote: z.string(),
        title: z.string().optional(),
        round: z.string().optional(),
      }),
    )
    .max(20),
});

/**
 * LLM extraction from already-fetched text. Every fact needs a quote that is
 * a substring of the source text. Skips entirely if providers exhausted.
 */
export async function extractFactsWithLlm(input: {
  text: string;
  sourceUrl: string;
  sourceKind: SourceKind;
  companyName: string;
}): Promise<{ facts: ExtractedFact[]; skipped?: string }> {
  const provider = createLlmProvider();
  if (!provider) return { facts: [], skipped: "no_llm_provider" };

  const snippet = normalizeWhitespace(input.text).slice(0, 6000);
  if (snippet.length < 40) return { facts: [], skipped: "text_too_short" };

  try {
    const raw = await Promise.race([
      provider.classify({
        title: `Extract company facts for ${input.companyName}`,
        descriptionText: snippet,
        locationRaw: null,
        snippet: `Extract structured company facts from this text. Return ONLY JSON:
{"facts":[{"fact_type":"hq|founded_year|team_size|founder|investor|industry|one_liner","value":"...","quote":"exact substring","title?":"...","round?":"..."}]}
Rules: quote MUST be an exact substring of the text. Do not invent. Prefer empty facts over guesses.
TEXT:
${snippet}`,
        rulesHint: { india_eligibility: "unclear" },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);

    if (!raw) return { facts: [], skipped: "llm_timeout_or_exhausted" };

    // Providers return classification shape; also accept {facts:[...]} payloads
    const candidate =
      raw && typeof raw === "object" && "facts" in (raw as object)
        ? raw
        : typeof raw === "object" &&
            raw !== null &&
            "eligibility_evidence" in (raw as object)
          ? { facts: [] }
          : raw;

    const parsed = LlmFactSchema.safeParse(candidate);
    if (!parsed.success) return { facts: [], skipped: "llm_parse_fail" };

    const facts: ExtractedFact[] = [];
    for (const f of parsed.data.facts) {
      if (
        !assertFactEvidence({
          quote: f.quote,
          sourceUrl: input.sourceUrl,
          sourceText: snippet,
        })
      ) {
        continue;
      }
      facts.push({
        factType: f.fact_type,
        value: f.value.trim(),
        sourceUrl: input.sourceUrl,
        quote: f.quote.trim(),
        sourceKind: input.sourceKind,
        confidence: 0.75,
        title: f.title,
        round: f.round,
        role: f.fact_type === "founder" ? "founded" : undefined,
      });
    }
    return { facts };
  } catch (err) {
    return {
      facts: [],
      skipped: err instanceof Error ? err.message.slice(0, 120) : "llm_error",
    };
  }
}
