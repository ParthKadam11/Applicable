import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { AtsSchema } from "../ats/types.js";
import { db, pool } from "../db/client.js";
import { companies } from "../db/schema.js";

const CompanySeedSchema = z.object({
  name: z.string().min(1),
  website: z.string().url(),
  ats: AtsSchema,
  ats_slug: z.string().min(1),
  active: z.boolean().optional().default(true),
});

const SeedFileSchema = z.object({
  companies: z.array(CompanySeedSchema).min(1),
});

async function main() {
  const path = resolve(process.cwd(), "companies.yaml");
  const raw = parseYaml(readFileSync(path, "utf8"));
  const { companies: seeds } = SeedFileSchema.parse(raw);

  const rows = seeds.map((c) => ({
    name: c.name,
    website: c.website,
    ats: c.ats,
    atsSlug: c.ats_slug,
    active: c.active,
  }));

  await db
    .insert(companies)
    .values(rows)
    .onConflictDoUpdate({
      target: [companies.ats, companies.atsSlug],
      set: {
        name: sql`excluded.name`,
        website: sql`excluded.website`,
        active: sql`excluded.active`,
      },
    });

  // Deactivate boards removed from companies.yaml so they stop ingesting.
  const keep = new Set(rows.map((r) => `${r.ats}:${r.atsSlug}`));
  const active = await db
    .select()
    .from(companies)
    .where(eq(companies.active, true));

  const toDeactivate = active.filter(
    (c) => !keep.has(`${c.ats}:${c.atsSlug}`),
  );

  for (const c of toDeactivate) {
    await db
      .update(companies)
      .set({ active: false })
      .where(eq(companies.id, c.id));
  }

  console.log(
    `Seeded ${rows.length} companies from companies.yaml (upsert by ats+slug).`,
  );
  if (toDeactivate.length > 0) {
    console.log(
      `Deactivated ${toDeactivate.length} not in yaml: ${toDeactivate
        .map((c) => c.name)
        .join(", ")}`,
    );
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
