/** Simple per-IP sliding window rate limiter. */
export class IpRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly rpm: number,
    private readonly windowMs = 60_000,
  ) {}

  /** Returns true if the request is allowed. */
  allow(ip: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const prev = (this.hits.get(ip) ?? []).filter((t) => t > cutoff);
    if (prev.length >= this.rpm) {
      this.hits.set(ip, prev);
      return false;
    }
    prev.push(now);
    this.hits.set(ip, prev);
    return true;
  }
}
