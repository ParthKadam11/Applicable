import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const { Pool } = pg;

/** Cap pool for shared 4–8GB hosts so MCP/app/ingest don't stampede Postgres. */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
