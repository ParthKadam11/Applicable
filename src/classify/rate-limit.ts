/** Simple token-bucket rate limiter for LLM calls. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly rpm: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = Math.max(1, rpm);
    this.lastRefill = now();
  }

  private refill(): void {
    const elapsed = this.now() - this.lastRefill;
    if (elapsed <= 0) return;
    const ratePerMs = this.rpm / 60_000;
    this.tokens = Math.min(this.rpm, this.tokens + elapsed * ratePerMs);
    this.lastRefill = this.now();
  }

  /** Wait until a token is available, then consume one. */
  async acquire(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / (this.rpm / 60_000));
      await new Promise((r) => setTimeout(r, Math.max(50, waitMs)));
    }
  }
}
