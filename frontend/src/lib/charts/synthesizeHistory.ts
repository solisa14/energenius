// Deterministic synthesized daily history for demo charts.
// TODO: replace with a real /history endpoint when available.

export interface DailyPoint {
  day: string;   // "d-13" ... "d-0" where d-0 = today
  value: number;
}

// Mulberry32 — small deterministic PRNG.
function prng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesizeDailySeries(
  dailyValue: number,
  days = 14,
  seed = 1,
): DailyPoint[] {
  const rng = prng(seed);
  const out: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // ±20% jitter, biased slightly upward toward "today" to imply growth.
    const trend = 1 + (days - 1 - i) * 0.01;
    const jitter = 0.8 + rng() * 0.4;
    out.push({
      day: `d-${i}`,
      value: Math.max(0, dailyValue * trend * jitter),
    });
  }
  return out;
}
