/** Small seeded PRNG (mulberry32) so every fresh simulation is reproducible. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number, digits = 1): number {
    const value = min + this.next() * (max - min);
    const f = 10 ** digits;
    return Math.round(value * f) / f;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick() from an empty list");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Weighted pick: [[value, weight], …]. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const copy = [...items];
    const out: T[] = [];
    while (copy.length && out.length < count) {
      out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0] as T);
    }
    return out;
  }
}
