/**
 * One-shot nightly LLM pass over unclear tech jobs (no prior LLM result).
 * Usage:
 *   npx tsx src/scripts/classify-unclear-nightly.ts --limit 100
 */
import {
  countOpenUnclearTech,
  runNightlyLlmPass,
} from "../classify/nightly.js";
import { db, pool } from "../db/client.js";

function parseLimit(argv: string[]): number | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--limit" && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    const m = /^--limit=(\d+)$/.exec(a);
    if (m) return Number(m[1]);
    // Bare number — npm often strips `--limit` (`npm run … -- 100`)
    if (/^\d+$/.test(a)) {
      const n = Number(a);
      if (n > 0) return Math.floor(n);
    }
  }
  return undefined;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));
  const before = await countOpenUnclearTech(db);
  console.log(`[classify:nightly] unclear tech open before: ${before}`);

  const result = await runNightlyLlmPass(db, { limit });
  const after = await countOpenUnclearTech(db);

  console.log("\n=== nightly LLM summary ===");
  console.log(JSON.stringify({ ...result, unclear_before: before, unclear_after: after }, null, 2));
  console.log(
    `moved_out_of_unclear=${result.movedOutOfUnclear} (unclear ${before} → ${after})`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
