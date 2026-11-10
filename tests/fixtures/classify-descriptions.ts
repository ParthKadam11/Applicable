export interface ClassifyFixture {
  id: string;
  title: string;
  locationRaw?: string;
  descriptionText: string;
  expect: {
    india_eligibility:
      | "open"
      | "india_remote"
      | "india_onsite"
      | "region_locked"
      | "unclear";
    contractor_or_eor?: boolean;
    seniority?: string;
    role_family?: string;
    interview_style_includes?: string[];
    compensation?: { min: number; max: number; currency: string } | null;
  };
}

/** Descriptions covering open / india_* / region_locked / unclear / tricky cases. */
export const CLASSIFY_FIXTURES: ClassifyFixture[] = [
  {
    id: "open-india",
    title: "Senior Backend Engineer",
    locationRaw: "Remote",
    descriptionText:
      "We are a distributed team. Candidates in India are welcome to apply. You will own our APIs.",
    expect: {
      india_eligibility: "india_remote",
      seniority: "senior",
      role_family: "backend",
    },
  },
  {
    id: "open-worldwide",
    title: "Frontend Engineer",
    descriptionText:
      "This role is remote worldwide. Work from anywhere as long as you have solid internet.",
    expect: {
      india_eligibility: "open",
      role_family: "frontend",
    },
  },
  {
    id: "unclear-apac",
    title: "Staff Platform Engineer",
    descriptionText:
      "Hiring across APAC for our infrastructure team. System design interview included.",
    expect: {
      india_eligibility: "unclear",
      seniority: "staff",
      role_family: "infra",
      interview_style_includes: ["system_design"],
    },
  },
  {
    id: "open-any-timezone",
    title: "Full Stack Developer",
    descriptionText:
      "We hire globally and support any timezone. Async-first culture.",
    expect: {
      india_eligibility: "open",
      role_family: "fullstack",
    },
  },
  {
    id: "open-global-remote",
    title: "ML Engineer",
    descriptionText:
      "Global remote role focused on machine learning research and production models.",
    expect: {
      india_eligibility: "open",
      role_family: "ml",
    },
  },
  {
    id: "open-deel-countries",
    title: "Backend Engineer",
    descriptionText:
      "We hire via Deel in 100+ countries. Compensation is $120,000-$150,000 per year.",
    expect: {
      india_eligibility: "open",
      contractor_or_eor: true,
      role_family: "backend",
      compensation: { min: 120000, max: 150000, currency: "USD" },
    },
  },
  {
    id: "locked-us-only",
    title: "Software Engineer",
    descriptionText:
      "This position is US only. You must be authorized to work in the United States.",
    expect: {
      india_eligibility: "region_locked",
    },
  },
  {
    id: "locked-remote-us-paren",
    title: "Product Engineer",
    locationRaw: "Remote (US)",
    descriptionText:
      "Join our product team. Location: Remote (US). Build delightful experiences.",
    expect: {
      india_eligibility: "region_locked",
    },
  },
  {
    id: "locked-pst-overlap",
    title: "Backend Engineer",
    descriptionText:
      "Remote, but must overlap 4h with PST. Interview includes a take-home and live coding.",
    expect: {
      india_eligibility: "region_locked",
      role_family: "backend",
      interview_style_includes: ["take_home", "live_coding"],
    },
  },
  {
    id: "locked-must-be-based",
    title: "Junior Frontend Engineer",
    descriptionText:
      "Candidates must be based in New York City. Hybrid schedule three days a week.",
    expect: {
      india_eligibility: "region_locked",
      seniority: "junior",
      role_family: "frontend",
    },
  },
  {
    id: "locked-eu-only",
    title: "DevOps Engineer",
    descriptionText:
      "EU only. You will manage Kubernetes clusters and CI pipelines.",
    expect: {
      india_eligibility: "region_locked",
      role_family: "infra",
    },
  },
  {
    id: "locked-uk-residents",
    title: "Data Scientist",
    descriptionText:
      "Open to UK residents. Expect a DSA screen and system design round.",
    expect: {
      india_eligibility: "region_locked",
      role_family: "ml",
      interview_style_includes: ["dsa", "system_design"],
    },
  },
  {
    id: "locked-title-us-code",
    title: "Software Engineer (US)",
    locationRaw: "Remote",
    descriptionText: "Build products with a great team.",
    expect: { india_eligibility: "region_locked" },
  },
  {
    id: "locked-visa-sponsorship",
    title: "Engineer",
    descriptionText:
      "Visa sponsorship not available. Must have US work authorization.",
    expect: { india_eligibility: "region_locked" },
  },
  {
    id: "unclear-bare-remote",
    title: "Engineer",
    locationRaw: "Remote",
    descriptionText:
      "We are hiring a remote engineer to join the team. Great benefits.",
    expect: {
      india_eligibility: "unclear",
    },
  },
  {
    id: "unclear-remote-apac",
    title: "Engineer",
    locationRaw: "Remote, APAC",
    descriptionText: "Join our platform team across the region.",
    expect: { india_eligibility: "unclear" },
  },
  {
    id: "unclear-remote-emea",
    title: "Engineer",
    locationRaw: "Remote, EMEA",
    descriptionText: "Join our platform team across the region.",
    expect: { india_eligibility: "unclear" },
  },
  {
    id: "unclear-no-location",
    title: "Intern Software Engineer",
    descriptionText:
      "Summer internship working on our TypeScript codebase. Pair programming encouraged.",
    expect: {
      india_eligibility: "unclear",
      seniority: "intern",
      interview_style_includes: ["pair_programming"],
    },
  },
  {
    id: "contractor-oyster",
    title: "Senior Fullstack Engineer",
    descriptionText:
      "Engagement is through Oyster as an employer of record. Remote role with flexible hours.",
    expect: {
      india_eligibility: "open",
      contractor_or_eor: true,
      seniority: "senior",
      role_family: "fullstack",
    },
  },
  {
    id: "contractor-rippling",
    title: "Mid-level Backend Engineer",
    descriptionText:
      "You will be hired via Rippling EOR. Location is remote. Salary €80k-€100k annually.",
    expect: {
      india_eligibility: "open",
      contractor_or_eor: true,
      seniority: "mid",
      role_family: "backend",
      compensation: { min: 80000, max: 100000, currency: "EUR" },
    },
  },
  {
    id: "open-work-from-anywhere",
    title: "SRE",
    descriptionText:
      "Work from anywhere. You must love on-call and infrastructure. Compensation £90k to £110k.",
    expect: {
      india_eligibility: "open",
      role_family: "infra",
      compensation: { min: 90000, max: 110000, currency: "GBP" },
    },
  },
  {
    id: "loc-locked-remote-usa",
    title: "Engineer",
    locationRaw: "Remote - USA",
    descriptionText: "Build products. Great benefits.",
    expect: { india_eligibility: "region_locked" },
  },
  {
    id: "loc-locked-emea",
    title: "Engineer",
    locationRaw: "EMEA",
    descriptionText: "Join our platform team.",
    expect: { india_eligibility: "region_locked" },
  },
  {
    id: "loc-locked-london",
    title: "Engineer",
    locationRaw: "London",
    descriptionText: "Hybrid in our London office.",
    expect: { india_eligibility: "region_locked" },
  },
  {
    id: "loc-open-worldwide",
    title: "Engineer",
    locationRaw: "Worldwide",
    descriptionText: "Ship code.",
    expect: { india_eligibility: "open" },
  },
  {
    id: "loc-india-onsite",
    title: "Engineer",
    locationRaw: "Bengaluru, India",
    descriptionText: "Backend services in our Bangalore office.",
    expect: { india_eligibility: "india_onsite" },
  },
  {
    id: "loc-india-remote",
    title: "Engineer",
    locationRaw: "Remote - India",
    descriptionText: "Backend services.",
    expect: { india_eligibility: "india_remote" },
  },
  {
    id: "neg-worldwide-team",
    title: "Backend Engineer",
    locationRaw: "Remote",
    descriptionText:
      "We are a worldwide team building cloud tools. Great culture and benefits.",
    expect: { india_eligibility: "unclear" },
  },
  {
    id: "neg-customers-countries",
    title: "Frontend Engineer",
    descriptionText:
      "Our customers are in 100+ countries. Come build UI for them.",
    expect: { india_eligibility: "unclear" },
  },
  {
    id: "neg-distributed-company",
    title: "Engineer",
    descriptionText:
      "We're distributed across the globe. Looking for a remote engineer.",
    expect: { india_eligibility: "unclear" },
  },
];
