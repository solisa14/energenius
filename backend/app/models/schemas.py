from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, TypeAlias

from pydantic import BaseModel, Field, field_validator, model_validator

ApplianceName = Literal["dishwasher", "washing_machine", "dryer", "ev_charger", "water_heater_boost"]

RecommendationLabel = Literal["best", "balanced", "convenient"]

GridMixSnapshot: TypeAlias = dict[str, float]


class ApplianceConfig(BaseModel):
    id: str
    name: str
    duration: int
    powerKw: float
    earliestStart: int
    latestFinish: int
    isNoisy: bool
    requiresPresence: bool = False
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
    sources: list[str] | None = None
    assistant_action: AvailabilityAssistantAction | None = None


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


class DayAvailability(BaseModel):
    date: date
    slots: list[bool]

    @field_validator("slots")
    @classmethod
    def slots_len_48(cls, v: list[bool]) -> list[bool]:
        if len(v) != 48:
            raise ValueError("slots must have length 48")
        return v


AvailabilityAssistantSource = Literal["calendar_sync", "chat_edit"]
AvailabilityAssistantStatus = Literal["pending", "applied", "skipped", "cancelled"]
AvailabilityResolution = Literal["home", "away", "skip"]


class AvailabilityAssistantAction(BaseModel):
    status: AvailabilityAssistantStatus
    action_id: str | None = None
    affected_dates: list[date] = Field(default_factory=list)
    refresh_recommendations: bool = False
    summary: str


class AvailabilityClarification(BaseModel):
    action_id: str
    source: AvailabilityAssistantSource
    date: date
    start_slot: int
    end_slot: int
    question_text: str
    set_home: bool | None = None


class AvailabilityActionReplyRequest(BaseModel):
    resolution: AvailabilityResolution | None = None
    message: str | None = None

    @model_validator(mode="after")
    def require_resolution_or_message(self) -> AvailabilityActionReplyRequest:
        if not self.resolution and not (self.message and self.message.strip()):
            raise ValueError("resolution or message is required")
        return self


class AvailabilityActionReplyResponse(BaseModel):
    ok: bool
    reply: str
    action: AvailabilityAssistantAction
    clarification: AvailabilityClarification | None = None
    days: list[DayAvailability] | None = None
