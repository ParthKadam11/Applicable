import { describe, expect, it } from "vitest";
import {
  companyNameFromHnComment,
  parseHnComments,
} from "../../src/discover/sources/hn.js";
import { parseHimalayasJobs } from "../../src/discover/sources/himalayas.js";
import { parseRemoteOkJobs } from "../../src/discover/sources/remoteok.js";
import { parseYcHits } from "../../src/discover/sources/yc.js";
import { isBlocked, loadBlocklist } from "../../src/discover/blocklist.js";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

describe("parseYcHits", () => {
  it("maps hiring companies", () => {
    const out = parseYcHits([
      { name: "Acme", website: "https://acme.dev", isHiring: true },
      { name: "Skip", website: "https://skip.dev", isHiring: false },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: "Acme",
      domain: "acme.dev",
      source: "yc",
    });
  });
});

describe("HN hiring parse", () => {
  it("extracts company name from classic Who is hiring line", () => {
    expect(
      companyNameFromHnComment(
        "Vercel (YC W20) | Remote | https://jobs.ashbyhq.com/vercel<br>We are hiring",
      ),
    ).toBe("Vercel");
  });

  it("parses ATS URLs from comments", () => {
    const out = parseHnComments(
      [
        {
          comment_text:
            "Linear | Remote | https://jobs.ashbyhq.com/linear<br>Engineers wanted",
        },
      ],
      "123",
    );
    expect(out[0]).toMatchObject({
      name: "Linear",
      ats: "ashby",
      atsSlug: "linear",
      source: "hn_hiring",
    });
  });
});

describe("remote feed parsers", () => {
  it("parses RemoteOK fixture rows", () => {
    const out = parseRemoteOkJobs([
      { id: 0 } as { company?: string },
      {
        company: "CoolCo",
        apply_url: "https://jobs.lever.co/coolco/abc",
        description: "Remote role",
      },
    ]);
    expect(out[0]).toMatchObject({
      name: "CoolCo",
      ats: "lever",
      atsSlug: "coolco",
      source: "remoteok",
    });
  });

  it("parses Himalayas fixture rows", () => {
    const out = parseHimalayasJobs([
      {
        companyName: "Basecamp",
        companySlug: "basecamp",
        description:
          'Apply via <a href="https://boards.greenhouse.io/basecamp">GH</a>',
      },
    ]);
    expect(out[0]).toMatchObject({
      name: "Basecamp",
      ats: "greenhouse",
      atsSlug: "basecamp",
      source: "himalayas",
    });
  });
});

describe("blocklist", () => {
  it("loads names/domains/slugs from yaml", () => {
    const path = resolve(process.cwd(), "tests/fixtures/blocklist.yaml");
    writeFileSync(
      path,
      `
companies: []
blocklist:
  - name: Notion
  - domain: stripe.com
  - ats_slug: bigcorp
`,
    );
    try {
      const bl = loadBlocklist(path);
      expect(isBlocked(bl, { name: "Notion" })).toBe(true);
      expect(isBlocked(bl, { name: "Ok", domain: "stripe.com" })).toBe(true);
      expect(isBlocked(bl, { name: "Ok", atsSlug: "bigcorp" })).toBe(true);
      expect(isBlocked(bl, { name: "Ok", domain: "ok.dev" })).toBe(false);
    } finally {
      unlinkSync(path);
    }
  });
});
