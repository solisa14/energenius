import type { ExternalData, TimelineSlot } from "@/lib/api/types";

/** Collect local calendar hours touched by [start, end). */
function hoursInRange(startISO: string, endISO: string): number[] {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const hours = new Set<number>();
  for (let t = start; t < end; t += 30 * 60 * 1000) {
    hours.add(new Date(t).getHours());
  }
  return [...hours].sort((a, b) => a - b);
}

function hourPrice(external: ExternalData, hour: number): number {
  const i = hour * 2;
  return (external.prices[i] + external.prices[i + 1]) / 2;
}

function hourCarbon(external: ExternalData, hour: number): number {
  const i = hour * 2;
  return (external.carbon[i] + external.carbon[i + 1]) / 2;
}

export function buildWhyCaption(
  slot: TimelineSlot,
  external: ExternalData | undefined,
): string | null {
  if (!external || external.prices.length !== 48 || external.carbon.length !== 48) {
    return "Balanced for cost and grid carbon using typical 30-minute slot patterns.";
  }

  const prices: number[] = [];
  const carbon: number[] = [];
  for (let h = 0; h < 24; h += 1) {
    prices.push(hourPrice(external, h));
    carbon.push(hourCarbon(external, h));
  }

  const sortedP = [...prices].sort((a, b) => a - b);
  const sortedC = [...carbon].sort((a, b) => a - b);
  const q1p = sortedP[Math.floor(sortedP.length * 0.25)];
  const q3p = sortedP[Math.floor(sortedP.length * 0.75)];
  const q1c = sortedC[Math.floor(sortedC.length * 0.25)];
  const q3c = sortedC[Math.floor(sortedC.length * 0.75)];

  const hs = hoursInRange(slot.start, slot.end);
  if (hs.length === 0) return null;

  const slotPrices = hs.map((h) => prices[h]);
  const slotCarbon = hs.map((h) => carbon[h]);
  const avgP = slotPrices.reduce((a, b) => a + b, 0) / slotPrices.length;
  const avgC = slotCarbon.reduce((a, b) => a + b, 0) / slotCarbon.length;

  const priceGood = avgP <= q1p;
  const priceBad = avgP >= q3p;
  const carbonGood = avgC <= q1c;
  const carbonBad = avgC >= q3c;

  const parts: string[] = [];
  if (priceGood) {
    parts.push("Electricity prices in this window are lower than most hours today.");
  } else if (!priceBad) {
    parts.push("Electricity prices are moderate for the day.");
  }
  if (carbonGood) {
    parts.push("Grid carbon intensity is in the cleaner part of the day.");
  } else if (!carbonBad) {
    parts.push("Grid carbon is typical for the day.");
  }

  if (parts.length === 0) {
    return "This window balances your schedule with grid conditions.";
  }
  return parts.slice(0, 2).join(" ");
}
