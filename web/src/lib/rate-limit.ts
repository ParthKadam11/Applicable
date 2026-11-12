/** Simple per-key sliding window rate limiter (process-local). */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly rpm: number,
    private readonly windowMs = 60_000,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const prev = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (prev.length >= this.rpm) {
      this.hits.set(key, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(key, prev);
    return true;
  }
}

export const ipApiLimiter = new SlidingWindowLimiter(60);
export const userSaveLimiter = new SlidingWindowLimiter(60);
