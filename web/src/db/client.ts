import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== "production") {
  console.warn("[db] DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as {
  applicablePool?: pg.Pool;
};

export const pool =
  globalForDb.applicablePool ??
  new Pool({
    connectionString: connectionString ?? "postgres://localhost:5432/applicable",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.applicablePool = pool;
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
