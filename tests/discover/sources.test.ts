import { describe, expect, it } from "vitest";
import {
  companyNameFromHnComment,
  parseHnComments,
} from "../../src/discover/sources/hn.js";
import { parseArbeitnowJobs } from "../../src/discover/sources/arbeitnow.js";
import { parseHimalayasJobs } from "../../src/discover/sources/himalayas.js";
import { parseJobicyJobs } from "../../src/discover/sources/jobicy.js";
import { parseRemoteOkJobs } from "../../src/discover/sources/remoteok.js";
import { parseRemotiveJobs } from "../../src/discover/sources/remotive.js";
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

  it("parses Remotive / Jobicy / Arbeitnow and prioritizes early-career", () => {
    const remotive = parseRemotiveJobs([
      {
        company_name: "LateCo",
        title: "Staff Engineer",
        description: "Apply https://jobs.lever.co/lateco/1",
        candidate_required_location: "USA only",
      },
      {
        company_name: "EarlyCo",
        title: "Junior Backend Engineer",
        description: "Worldwide. Apply https://jobs.ashbyhq.com/earlyco",
        candidate_required_location: "Worldwide",
      },
    ]);
    expect(remotive[0]).toMatchObject({
      name: "EarlyCo",
      ats: "ashby",
      source: "remotive",
      earlyCareer: true,
      priorityGeo: true,
    });

    const jobicy = parseJobicyJobs([
      {
        companyName: "JobiCo",
        jobTitle: "Internship - Software",
        url: "https://boards.greenhouse.io/jobico/jobs/1",
        jobGeo: "India",
      },
    ]);
    expect(jobicy[0]).toMatchObject({
      name: "JobiCo",
      ats: "greenhouse",
      source: "jobicy",
      earlyCareer: true,
      priorityGeo: true,
    });

    const arbeit = parseArbeitnowJobs([
      {
        company_name: "OnsiteCo",
        title: "Dev",
        remote: false,
        url: "https://jobs.lever.co/onsiteco/1",
      },
      {
        company_name: "RemoteCo",
        title: "New Grad Engineer",
        remote: true,
        description: "Apply https://jobs.lever.co/remoteco/1",
        location: "APAC",
      },
    ]);
    expect(arbeit).toHaveLength(1);
    expect(arbeit[0]).toMatchObject({
      name: "RemoteCo",
      ats: "lever",
      source: "arbeitnow",
      earlyCareer: true,
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
