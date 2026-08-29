/**
 * Clock abstraction for domain modules and tests.
 *
 * Later family-feature modules take a `clock: Clock` dependency so scheduling
 * logic (handoff windows, attention states, travel buffers) can be tested
 * against fixed instants instead of wall time.
 */
export interface Clock {
  /** Current instant. */
  now(): Date;
  /** Current instant as a UTC ISO string (matches the contracts' IsoDate). */
  nowIso(): string;
}

/** The production clock: thin wrapper over the system clock. */
export class RealClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowIso(): string {
    return new Date().toISOString();
  }
}

/**
 * Deterministic clock pinned to a fixed instant. Advance it explicitly with
 * `advanceMs` / `advanceTo` to walk domain logic through time.
 */
export class FixedClock implements Clock {
  private epochMs: number;

  constructor(iso: string) {
    this.epochMs = parseIso(iso);
  }

  now(): Date {
    return new Date(this.epochMs);
  }

  nowIso(): string {
    return new Date(this.epochMs).toISOString();
  }

  /** Move the clock forward by `ms` milliseconds. */
  advanceMs(ms: number): void {
    this.epochMs += ms;
  }

  /** Jump the clock to a specific ISO instant. */
  advanceTo(iso: string): void {
    this.epochMs = parseIso(iso);
  }
}

function parseIso(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Clock: invalid ISO timestamp: ${iso}`);
  }
  return ms;
}
