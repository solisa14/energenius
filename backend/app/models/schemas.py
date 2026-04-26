from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, field_validator, model_validator

ApplianceName = Literal["dishwasher", "washing_machine", "dryer", "ev_charger", "water_heater_boost"]

RecommendationLabel = Literal["best", "balanced", "convenient"]

GridMixSnapshot: TypeAlias = dict[str, float]

DataSourceTier = Literal["real", "partial", "mock"]


class DataSourceMeta(BaseModel):
    data_source: DataSourceTier
    warnings: list[str]
    fetched_at: datetime
    grid_zone: str | None = None


class ApplianceConfig(BaseModel):
    id: str
    name: str
    duration: int
    powerKw: float
    earliestStart: int
    latestFinish: int
    isNoisy: bool
    satisfactionByTime: dict[str, float]


class TimelineSlot(BaseModel):
    start: datetime
    end: datetime
    appliance: str
    cost_usd: float
    co2_grams: float
    score: float


class RecommendationOption(BaseModel):
    label: RecommendationLabel
    slot: TimelineSlot
    savings_vs_baseline_usd: float
    co2_reduction_grams: float
    why: str


class ApplianceRecommendation(BaseModel):
    appliance: ApplianceName
    duration: int
    powerKw: float
    options: list[RecommendationOption]


class SavingsSummary(BaseModel):
    total_daily_cost_usd: float
    estimated_monthly_savings_usd: float
    co2_reduction_grams_today: float
    co2_reduction_grams_monthly: float


class DailyRecommendation(BaseModel):
    date: date
    appliances: list[ApplianceRecommendation]
    hvac_schedule: list[TimelineSlot]
    grid_mix_now: GridMixSnapshot
    totals: SavingsSummary
    data_source: DataSourceMeta
    current_carbon_intensity_g_per_kwh: float | None = None


class FeedbackEvent(BaseModel):
    appliance: str
    chosen_option: str
    response: Literal["yes", "no", "different_time"]
    suggested_time: datetime | None = None


class UserWeights(BaseModel):
    cost: float
    emissions: float
    satisfaction: float

    @model_validator(mode="after")
    def check_sum_approximately_one(self) -> UserWeights:
        total: float = self.cost + self.emissions + self.satisfaction
        if abs(total - 1.0) > 1e-3:
            raise ValueError("cost + emissions + satisfaction must sum to 1.0 (within 1e-3)")
        return self


class FeedbackResponse(BaseModel):
    ok: bool
    updated_weights: UserWeights


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    thread_id: str
    sources: list[dict[str, Any]] | None = None


class ExternalData(BaseModel):
    prices: list[float]
    carbon: list[float]
    hourly_temp_f: list[float]

    @model_validator(mode="after")
    def check_series_lengths(self) -> ExternalData:
        if len(self.prices) != 48 or len(self.carbon) != 48:
            raise ValueError("prices and carbon must have length 48")
        if len(self.hourly_temp_f) != 24:
            raise ValueError("hourly_temp_f must have length 24")
        return self


class ExternalDataResponse(BaseModel):
    prices: list[float]
    carbon: list[float]
    hourly_temp_f: list[float]
    data_source: DataSourceMeta
    current_carbon_intensity_g_per_kwh: float | None = None


class DayAvailability(BaseModel):
    date: date
    slots: list[bool]

    @field_validator("slots")
    @classmethod
    def slots_len_48(cls, v: list[bool]) -> list[bool]:
        if len(v) != 48:
            raise ValueError("slots must have length 48")
        return v


class CalendarSyncRequest(BaseModel):
    """Body for POST /api/calendar-sync. `provider_token` is the Google OAuth access token from the Supabase session; not stored server-side."""

    provider_token: str | None = None
