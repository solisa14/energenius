// Pure helpers for the 48-slot daily timeline.

export const HOURS = 24;
export const SLOTS_PER_HOUR = 2;
export const TOTAL_SLOTS = HOURS * SLOTS_PER_HOUR;

/** Returns 0..TOTAL_SLOTS for a given ISO datetime relative to dayStart. Clamped. */
export function slotIndexFromISO(iso: string, dayStart: Date): number {
  const t = new Date(iso).getTime();
  const minutes = Math.round((t - dayStart.getTime()) / 60000);
  const slot = Math.floor(minutes / 30);
  return Math.max(0, Math.min(TOTAL_SLOTS, slot));
}

/** Returns a length-24 boolean mask of hours that fall in the requested quartile. */
export function quartileMask(values: number[], which: "top" | "bottom"): boolean[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return values.map((v) => (which === "top" ? v >= q3 : v <= q1));
}

export function formatHourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  const mm = m.toString().padStart(2, "0");
  return `${h}:${mm} ${ampm}`;
}

export function formatTimeRange(startISO: string, endISO: string): string {
  return `${fmtTime(new Date(startISO))}–${fmtTime(new Date(endISO))}`;
}

export function formatTime(iso: string): string {
  return fmtTime(new Date(iso));
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function currentSlotIndex(now: Date, dayStart: Date): number | null {
  const ms = now.getTime() - dayStart.getTime();
  if (ms < 0 || ms > 24 * 60 * 60 * 1000) return null;
  return Math.floor(ms / 60000 / 30);
}

export type DayChoice = "today" | "tomorrow";

/** Local calendar date as YYYY-MM-DD for today or tomorrow. */
export function isoDateForChoice(choice: DayChoice): string {
  const d = new Date();
  if (choice === "tomorrow") d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function readableDateFromISO(isoDate: string): string {
  return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
