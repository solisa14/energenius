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
  /** Human-readable context lines (memory excerpts, file labels). */
  sources?: string[] | null;
  assistant_action?: AvailabilityAssistantAction | null;
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

export type AvailabilityAssistantStatus =
  | "pending"
  | "applied"
  | "skipped"
  | "cancelled";

export type AvailabilityAssistantSource = "calendar_sync" | "chat_edit";

export interface AvailabilityAssistantAction {
  status: AvailabilityAssistantStatus;
  action_id?: string | null;
  affected_dates: IsoDate[];
  refresh_recommendations: boolean;
  summary: string;
}

export interface AvailabilityClarification {
  action_id: string;
  source: AvailabilityAssistantSource;
  date: IsoDate;
  start_slot: number;
  end_slot: number;
  question_text: string;
  set_home?: boolean | null;
}

export interface CalendarSyncResponse {
  days: DayAvailability[];
  clarifications: AvailabilityClarification[];
  summary: string;
}

export interface CalendarSyncRequest {
  provider_token?: string | null;
  timezone?: string | null;
}

export type AvailabilityResolution = "home" | "away" | "skip";

export interface AvailabilityActionReplyRequest {
  resolution?: AvailabilityResolution | null;
  message?: string | null;
}

export interface AvailabilityActionReplyResponse {
  ok: boolean;
  reply: string;
  action: AvailabilityAssistantAction;
  clarification?: AvailabilityClarification | null;
  days?: DayAvailability[] | null;
}
