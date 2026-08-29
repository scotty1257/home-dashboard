interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Minimal in-memory TTL cache used to serve stale data gracefully when a
 * provider (weather, Home Assistant) is unreachable.
 */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();

  set(key: string, value: T, ttlMs: number): void {
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Return the value even if the TTL has passed (for offline fallback). */
  getStale(key: string): T | undefined {
    return this.map.get(key)?.value;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): void {
    this.map.delete(key);
  }
}
