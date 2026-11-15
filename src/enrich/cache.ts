import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const CACHE_ROOT = join(process.cwd(), ".enrich-cache");

function keyPath(kind: string, key: string): string {
  const h = createHash("sha256").update(key).digest("hex").slice(0, 24);
  const dir = join(CACHE_ROOT, kind);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${h}.json`);
}

export type CacheEntry<T> = {
  key: string;
  fetchedAt: string;
  value: T;
};

export function readCache<T>(kind: string, key: string): CacheEntry<T> | null {
  const path = keyPath(kind, key);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CacheEntry<T>;
  } catch {
    return null;
  }
}

export function writeCache<T>(kind: string, key: string, value: T): void {
  const path = keyPath(kind, key);
  const entry: CacheEntry<T> = {
    key,
    fetchedAt: new Date().toISOString(),
    value,
  };
  writeFileSync(path, JSON.stringify(entry));
}

/** Soft TTL helper — still returns stale data if present (caller decides). */
export function cacheAgeMs(entry: CacheEntry<unknown>): number {
  return Date.now() - new Date(entry.fetchedAt).getTime();
}
