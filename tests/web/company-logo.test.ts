import { describe, expect, it } from "vitest";
import {
  companyLogoCandidates,
  companyLogoDomain,
  hostnameFromWebsite,
} from "../../web/src/lib/company-logo";

describe("companyLogoDomain", () => {
  it("ignores example.com placeholders and uses known map", () => {
    expect(companyLogoDomain("Supabase", "https://example.com")).toBe(
      "supabase.com",
    );
    expect(companyLogoDomain("Tailscale", "https://example.com")).toBe(
      "tailscale.com",
    );
    expect(hostnameFromWebsite("https://example.com")).toBeNull();
  });

  it("uses real websites when present", () => {
    expect(companyLogoDomain("Acme", "https://www.acme.dev")).toBe("acme.dev");
  });

  it("falls back to known names without website", () => {
    expect(companyLogoDomain("Linear")).toBe("linear.app");
    expect(companyLogoDomain("OpenAI")).toBe("openai.com");
  });

  it("builds multi-cdn candidates", () => {
    const urls = companyLogoCandidates("supabase.com");
    expect(urls[0]).toContain("unavatar.io/supabase.com");
    expect(urls.length).toBeGreaterThanOrEqual(2);
  });
});
