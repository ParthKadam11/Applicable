import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const BlockEntrySchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1).optional(),
    domain: z.string().min(1).optional(),
    ats_slug: z.string().min(1).optional(),
  }),
]);

const YamlSchema = z.object({
  companies: z
    .array(
      z.object({
        name: z.string(),
        website: z.string().optional(),
        ats: z.string().optional(),
        ats_slug: z.string().optional(),
        active: z.boolean().optional(),
      }),
    )
    .optional()
    .default([]),
  blocklist: z.array(BlockEntrySchema).optional().default([]),
});

export interface Blocklist {
  names: Set<string>;
  domains: Set<string>;
  slugs: Set<string>;
}

export function loadBlocklist(
  path = resolve(process.cwd(), "companies.yaml"),
): Blocklist {
  const raw = parseYaml(readFileSync(path, "utf8"));
  const parsed = YamlSchema.parse(raw);

  const names = new Set<string>();
  const domains = new Set<string>();
  const slugs = new Set<string>();

  for (const entry of parsed.blocklist) {
    if (typeof entry === "string") {
      names.add(entry.toLowerCase());
      continue;
    }
    if (entry.name) names.add(entry.name.toLowerCase());
    if (entry.domain) {
      domains.add(entry.domain.toLowerCase().replace(/^www\./, ""));
    }
    if (entry.ats_slug) slugs.add(entry.ats_slug.toLowerCase());
  }

  // Inactive overrides in companies.yaml also act as a block.
  for (const c of parsed.companies) {
    if (c.active === false) {
      names.add(c.name.toLowerCase());
      if (c.ats_slug) slugs.add(c.ats_slug.toLowerCase());
    }
  }

  return { names, domains, slugs };
}

export function isBlocked(
  blocklist: Blocklist,
  input: { name: string; domain?: string | null; atsSlug?: string | null },
): boolean {
  if (blocklist.names.has(input.name.toLowerCase())) return true;
  if (input.domain && blocklist.domains.has(input.domain.toLowerCase())) {
    return true;
  }
  if (input.atsSlug && blocklist.slugs.has(input.atsSlug.toLowerCase())) {
    return true;
  }
  return false;
}
