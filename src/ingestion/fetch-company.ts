import { eq } from "drizzle-orm";
import { getAdapter } from "../ats/index.js";
import type { Db } from "../db/client.js";
import { companies, fetchRuns } from "../db/schema.js";
import { upsertJobs } from "./upsert.js";

export interface FetchCompanyResult {
  companyId: string;
  companyName: string;
  ok: boolean;
  jobCount: number;
  closedCount: number;
  error?: string;
}

export async function fetchCompanyJobs(
  db: Db,
  companyId: string,
  options?: { timeoutMs?: number },
): Promise<FetchCompanyResult> {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }

  const [run] = await db
    .insert(fetchRuns)
    .values({ companyId, ok: false })
    .returning();

  if (!run) {
    throw new Error("Failed to create fetch_runs row");
  }

  const timeoutMs = options?.timeoutMs ?? 30_000;

  try {
    const adapter = getAdapter(company.ats);
    const jobs = await withTimeout(
      adapter.fetchJobs(company.atsSlug, company.id),
      timeoutMs,
      `Fetch timed out after ${timeoutMs}ms for ${company.name}`,
    );

    const result = await upsertJobs(db, company.id, jobs);

    await db
      .update(fetchRuns)
      .set({
        ok: true,
        jobCount: result.upserted,
        finishedAt: new Date(),
        error: null,
      })
      .where(eq(fetchRuns.id, run.id));

    return {
      companyId: company.id,
      companyName: company.name,
      ok: true,
      jobCount: result.upserted,
      closedCount: result.closed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .update(fetchRuns)
      .set({
        ok: false,
        jobCount: null,
        finishedAt: new Date(),
        error: message.slice(0, 2000),
      })
      .where(eq(fetchRuns.id, run.id));

    return {
      companyId: company.id,
      companyName: company.name,
      ok: false,
      jobCount: 0,
      closedCount: 0,
      error: message,
    };
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
