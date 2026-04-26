// Optional mock payloads when VITE_USE_MOCKS=true (no running FastAPI).

import type {
  ApplianceName,
  ApplianceRecommendation,
  DailyRecommendation,
  ExternalData,
  RecommendationOption,
} from "./types";

function at(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

interface OptionSeed {
  startHour: number;
  startMinute?: number;
  cost_usd: number;
  co2_grams: number;
  score: number;
  savings_vs_baseline_usd: number;
  co2_reduction_grams: number;
  why: string;
}

function makeOption(
  label: RecommendationOption["label"],
  seed: OptionSeed,
  durationSlots: number,
  appliance: ApplianceName,
): RecommendationOption {
  const start = at(seed.startHour, seed.startMinute ?? 0);
  const endDate = new Date(start);
  endDate.setMinutes(endDate.getMinutes() + durationSlots * 30);
  return {
    label,
    slot: {
      start,
      end: endDate.toISOString(),
      appliance,
      cost_usd: seed.cost_usd,
      co2_grams: seed.co2_grams,
      score: seed.score,
    },
    savings_vs_baseline_usd: seed.savings_vs_baseline_usd,
    co2_reduction_grams: seed.co2_reduction_grams,
    why: seed.why,
  };
}

function makeAppliance(
  appliance: ApplianceName,
  durationSlots: number,
  powerKw: number,
  best: OptionSeed,
  balanced: OptionSeed,
  convenient: OptionSeed,
): ApplianceRecommendation {
  return {
    appliance,
    duration: durationSlots,
    powerKw,
    options: [
      makeOption("best", best, durationSlots, appliance),
      makeOption("balanced", balanced, durationSlots, appliance),
      makeOption("convenient", convenient, durationSlots, appliance),
    ],
  };
}

const PRICES_24 = [
  0.08, 0.07, 0.07, 0.07, 0.08, 0.09, 0.11, 0.14, 0.16, 0.15, 0.13, 0.11, 0.1,
  0.1, 0.12, 0.18, 0.24, 0.3, 0.32, 0.28, 0.2, 0.14, 0.1, 0.09,
];
const CARBON_24 = [
  520, 510, 500, 495, 500, 530, 580, 600, 560, 480, 400, 340, 320, 330, 360, 420,
  500, 560, 590, 580, 540, 500, 480, 510,
];
const HOURLY_TEMP = [
  68, 67, 66, 65, 65, 66, 70, 75, 80, 85, 89, 92, 94, 95, 95, 93, 90, 86, 82, 78,
  75, 72, 70, 69,
];

function expand24To48(a: number[]): number[] {
  return a.flatMap((v) => [v, v]);
}

export const mockDailyRecommendation: DailyRecommendation = {
  date: new Date().toISOString().slice(0, 10),
  appliances: [
    makeAppliance(
      "dishwasher",
      3,
      1.8,
      {
        startHour: 13,
        cost_usd: 0.42,
        co2_grams: 480,
        score: 0.91,
        savings_vs_baseline_usd: 0.62,
        co2_reduction_grams: 320,
        why: "Lowest price window with strong carbon savings vs baseline.",
      },
      {
        startHour: 11,
        cost_usd: 0.51,
        co2_grams: 390,
        score: 0.84,
        savings_vs_baseline_usd: 0.38,
        co2_reduction_grams: 220,
        why: "Good balance of cost and grid mix.",
      },
      {
        startHour: 19,
        cost_usd: 0.86,
        co2_grams: 720,
        score: 0.62,
        savings_vs_baseline_usd: 0.1,
        co2_reduction_grams: 60,
        why: "Evening window if you need dinner-hour convenience.",
      },
    ),
    makeAppliance(
      "ev_charger",
      12,
      7.2,
      {
        startHour: 1,
        cost_usd: 3.15,
        co2_grams: 2100,
        score: 0.95,
        savings_vs_baseline_usd: 2.4,
        co2_reduction_grams: 1800,
        why: "Overnight LMP dip — cheapest energy over the full charge block.",
      },
      {
        startHour: 11,
        cost_usd: 4.2,
        co2_grams: 1620,
        score: 0.83,
        savings_vs_baseline_usd: 1.55,
        co2_reduction_grams: 1120,
        why: "Midday when solar is strong on the grid.",
      },
      {
        startHour: 18,
        cost_usd: 6.4,
        co2_grams: 3100,
        score: 0.55,
        savings_vs_baseline_usd: 0.3,
        co2_reduction_grams: 200,
        why: "Peak time — use only if you need the car at night.",
      },
    ),
    makeAppliance(
      "washing_machine",
      2,
      0.9,
      {
        startHour: 11,
        cost_usd: 0.18,
        co2_grams: 220,
        score: 0.84,
        savings_vs_baseline_usd: 0.22,
        co2_reduction_grams: 140,
        why: "Best overlap of clean power and your availability.",
      },
      {
        startHour: 14,
        cost_usd: 0.21,
        co2_grams: 250,
        score: 0.79,
        savings_vs_baseline_usd: 0.15,
        co2_reduction_grams: 100,
        why: "Slightly more expensive but still in a low-carbon hour.",
      },
      {
        startHour: 18,
        cost_usd: 0.34,
        co2_grams: 360,
        score: 0.58,
        savings_vs_baseline_usd: 0.05,
        co2_reduction_grams: 40,
        why: "Evening convenience window.",
      },
    ),
  ],
  hvac_schedule: [
    {
      start: at(5, 0),
      end: at(7, 0),
      appliance: "hvac_heat",
      cost_usd: 0.45,
      co2_grams: 520,
      score: 0.86,
    },
    {
      start: at(13, 0),
      end: at(15, 0),
      appliance: "hvac_cool",
      cost_usd: 0.58,
      co2_grams: 480,
      score: 0.79,
    },
  ],
  grid_mix_now: {
    nuclear: 0.22,
    gas: 0.4,
    wind: 0.18,
    solar: 0.12,
    hydro: 0.05,
    coal: 0.03,
  },
  totals: {
    total_daily_cost_usd: 4.12,
    estimated_monthly_savings_usd: 47.2,
    co2_reduction_grams_today: 410,
    co2_reduction_grams_monthly: 12400,
  },
};

export const mockExternalData: ExternalData = {
  prices: expand24To48(PRICES_24),
  carbon: expand24To48(CARBON_24),
  hourly_temp_f: HOURLY_TEMP,
};
