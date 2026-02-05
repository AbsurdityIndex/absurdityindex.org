/**
 * Token bucket rate limiter for X API calls.
 * X API v2 free tier: 50 tweets/24h, 1500 tweets/month.
 * App-level read: 10,000 tweets/month.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number,
    private readonly refillRatePerSecond: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  async acquire(cost = 1): Promise<void> {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return;
    }

    // Wait until we have enough tokens
    const deficit = cost - this.tokens;
    const waitMs = (deficit / this.refillRatePerSecond) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens -= cost;
  }

  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Pre-configured limiters for X API tiers
export const tweetLimiter = new RateLimiter(50, 50 / 86400); // 50 per 24h
export const readLimiter = new RateLimiter(100, 100 / 900);  // 100 per 15min window
