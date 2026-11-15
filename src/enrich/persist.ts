import { eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  companies,
  companyFacts,
  companyInvestors,
  companyPeople,
  investorAliases,
  investors,
  people,
} from "../db/schema.js";
import { canonicalInvestorName, normalizeName } from "./normalize.js";
import type { ExtractedFact } from "./types.js";

async function upsertPerson(
  db: Db,
  name: string,
  linkedin?: string,
): Promise<string> {
  const normalized = normalizeName(name);
  const [existing] = await db
    .select()
    .from(people)
    .where(eq(people.nameNormalized, normalized))
    .limit(1);
  if (existing) {
    if (linkedin && !existing.linkedin) {
      await db
        .update(people)
        .set({ linkedin })
        .where(eq(people.id, existing.id));
    }
    return existing.id;
  }
  const [row] = await db
    .insert(people)
    .values({
      name: name.trim(),
      nameNormalized: normalized,
      linkedin: linkedin ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row.id;
  const [again] = await db
    .select()
    .from(people)
    .where(eq(people.nameNormalized, normalized))
    .limit(1);
  return again!.id;
}

async function upsertInvestor(db: Db, rawName: string): Promise<string> {
  const { name, normalized } = canonicalInvestorName(rawName);
  // Resolve via alias table first
  const [alias] = await db
    .select()
    .from(investorAliases)
    .where(eq(investorAliases.aliasNormalized, normalizeName(rawName)))
    .limit(1);
  if (alias) return alias.investorId;

  const [existing] = await db
    .select()
    .from(investors)
    .where(eq(investors.nameNormalized, normalized))
    .limit(1);
  if (existing) {
    // ensure alias for raw form
    await db
      .insert(investorAliases)
      .values({
        aliasNormalized: normalizeName(rawName),
        investorId: existing.id,
      })
      .onConflictDoNothing();
    return existing.id;
  }

  const [row] = await db
    .insert(investors)
    .values({ name, nameNormalized: normalized })
    .onConflictDoNothing()
    .returning();
  const id =
    row?.id ??
    (
      await db
        .select()
        .from(investors)
        .where(eq(investors.nameNormalized, normalized))
        .limit(1)
    )[0]!.id;

  // Seed known aliases pointing here
  await db
    .insert(investorAliases)
    .values({ aliasNormalized: normalizeName(rawName), investorId: id })
    .onConflictDoNothing();
  if (normalizeName(rawName) !== normalized) {
    await db
      .insert(investorAliases)
      .values({ aliasNormalized: normalized, investorId: id })
      .onConflictDoNothing();
  }
  return id;
}

export async function persistFacts(
  db: Db,
  companyId: string,
  facts: ExtractedFact[],
): Promise<number> {
  let written = 0;
  const now = new Date();

  let foundedYear: number | null = null;
  let teamSize: number | null = null;
  let oneLiner: string | null = null;
  let hqCity: string | null = null;
  let hqCountry: string | null = null;
  let ycBatch: string | null = null;

  for (const f of facts) {
    try {
      await db
        .insert(companyFacts)
        .values({
          companyId,
          factType: f.factType,
          value: f.value.slice(0, 500),
          sourceUrl: f.sourceUrl.slice(0, 1000),
          quote: f.quote.slice(0, 1000),
          sourceKind: f.sourceKind,
          confidence: f.confidence,
          extractedAt: now,
        })
        .onConflictDoNothing();
      written += 1;
    } catch {
      // unique conflict or transient — soft continue
    }

    if (f.factType === "founded_year") {
      const y = Number(f.value);
      if (y >= 1800 && y <= new Date().getFullYear()) foundedYear = y;
    }
    if (f.factType === "team_size") {
      const n = Number(f.value);
      if (n > 0 && n < 1_000_000) teamSize = n;
    }
    if (f.factType === "one_liner" && f.value) oneLiner = f.value.slice(0, 400);
    if (f.factType === "hq") {
      hqCity = f.city ?? f.value.split(",")[0]?.trim() ?? null;
      hqCountry =
        f.country ??
        (f.value.includes(",")
          ? f.value.split(",").slice(-1)[0]?.trim() ?? null
          : null);
    }
    if (f.factType === "batch") ycBatch = f.value;

    if (f.factType === "founder") {
      const personId = await upsertPerson(db, f.value, f.linkedin);
      await db
        .insert(companyPeople)
        .values({
          companyId,
          personId,
          role: f.role ?? "founded",
          title: f.title ?? "Founder",
          sourceUrl: f.sourceUrl,
          quote: f.quote,
          extractedAt: now,
        })
        .onConflictDoNothing();
    }
    if (f.factType === "investor") {
      const investorId = await upsertInvestor(db, f.value);
      await db
        .insert(companyInvestors)
        .values({
          companyId,
          investorId,
          round: f.round ?? null,
          sourceUrl: f.sourceUrl,
          quote: f.quote,
          extractedAt: now,
        })
        .onConflictDoNothing();
    }
  }

  await db
    .update(companies)
    .set({
      enrichedAt: now,
      ...(foundedYear != null ? { foundedYear } : {}),
      ...(teamSize != null ? { teamSize } : {}),
      ...(oneLiner ? { oneLiner } : {}),
      ...(hqCity ? { hqCity } : {}),
      ...(hqCountry ? { hqCountry } : {}),
      ...(ycBatch ? { ycBatch } : {}),
    })
    .where(eq(companies.id, companyId));
  return written;
}

/**
 * Ensure Peak XV aliases exist only when the investor row already exists
 * (created by a real company_investors write). Avoids orphan Investor rows.
 */
export async function seedInvestorAliases(db: Db): Promise<void> {
  const [peak] = await db
    .select()
    .from(investors)
    .where(eq(investors.nameNormalized, normalizeName("Peak XV Partners")))
    .limit(1);
  if (!peak) return;
  for (const a of ["Sequoia India", "formerly Sequoia India", "Peak XV"]) {
    await db
      .insert(investorAliases)
      .values({ aliasNormalized: normalizeName(a), investorId: peak.id })
      .onConflictDoNothing();
  }
  void sql;
}
