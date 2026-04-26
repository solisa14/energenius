// TypeScript types mirroring backend/app/models/schemas.py.
// Field names MUST match the Python models exactly (camelCase for powerKw, earliestStart, etc. where the backend uses it).

export type ApplianceName =
  | "dishwasher"
  | "washing_machine"
  | "dryer"
  | "ev_charger"
  | "water_heater_boost";

/** Alias used in UI state (same as backend `ApplianceName`). */
export type Appliance = ApplianceName;

export type RecommendationLabel = "best" | "balanced" | "convenient";

/** ISO 8601 strings from JSON datetime fields. */
export type IsoDateTime = string;
/** YYYY-MM-DD from JSON date fields. */
export type IsoDate = string;

export interface TimelineSlot {
  start: IsoDateTime;
  end: IsoDateTime;
  appliance: string;
  cost_usd: number;
  co2_grams: number;
  score: number;
}

export interface RecommendationOption {
  label: RecommendationLabel;
  slot: TimelineSlot;
  savings_vs_baseline_usd: number;
  co2_reduction_grams: number;
  why: string;
}

export interface ApplianceRecommendation {
  appliance: ApplianceName;
  /** 30-minute slots count (per backend / PuLP). */
  duration: number;
  powerKw: number;
  options: RecommendationOption[];
}

export interface SavingsSummary {
  total_daily_cost_usd: number;
  estimated_monthly_savings_usd: number;
  co2_reduction_grams_today: number;
  co2_reduction_grams_monthly: number;
}

export interface DailyRecommendation {
  date: IsoDate;
  appliances: ApplianceRecommendation[];
  hvac_schedule: TimelineSlot[];
  grid_mix_now: Record<string, number>;
  totals: SavingsSummary;
}

export type FeedbackResponseType = "yes" | "no" | "different_time";

export interface FeedbackEvent {
  appliance: string;
  chosen_option: string;
  response: FeedbackResponseType;
  suggested_time: IsoDateTime | null;
}

export interface UserWeights {
  cost: number;
  emissions: number;
  satisfaction: number;
}

export interface FeedbackResponse {
  ok: boolean;
  updated_weights: UserWeights;
}

export interface ChatRequest {
  message: string;
  thread_id?: string;
}

export interface ChatResponse {
  reply: string;
  thread_id: string;
  /** Mirrors backend: arbitrary source dicts. */
  sources?: Record<string, unknown>[] | null;
}

export interface ExternalData {
  prices: number[];
  carbon: number[];
  hourly_temp_f: number[];
}

export interface DayAvailability {
  date: IsoDate;
  slots: boolean[];
}

/** Kept for future use if POST /api/calendar-sync accepts a body. */
export interface CalendarSyncRequest {
  provider_token?: string | null;
}
