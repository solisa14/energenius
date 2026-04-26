"""EMA weight updates from user feedback."""

from __future__ import annotations

from backend.app.models.schemas import FeedbackEvent, UserWeights

_ALPHA_YES = 0.1
_ALPHA_DIFF = 0.05
_WMIN = 0.05
_WMAX = 0.85


def _renorm(c: float, e: float, s: float) -> tuple[float, float, float]:
    c = min(max(c, _WMIN), _WMAX)
    e = min(max(e, _WMIN), _WMAX)
    s = min(max(s, _WMIN), _WMAX)
    t = c + e + s
    return c / t, e / t, s / t


def update_user_weights(prev: UserWeights, event: FeedbackEvent) -> UserWeights:
    c, e, s = prev.cost, prev.emissions, prev.satisfaction
    if event.response == "yes":
        if event.chosen_option == "best":
            c = c + _ALPHA_YES * (1.0 - c)
        elif event.chosen_option == "balanced":
            e = e + _ALPHA_YES * (1.0 - e)
        elif event.chosen_option == "convenient":
            s = s + _ALPHA_YES * (1.0 - s)
    elif event.response == "different_time":
        s = s + _ALPHA_DIFF * (1.0 - s)
    c, e, s = _renorm(c, e, s)
    return UserWeights(cost=c, emissions=e, satisfaction=s)


if __name__ == "__main__":
    weights = UserWeights(cost=1 / 3, emissions=1 / 3, satisfaction=1 / 3)
    events = [
        FeedbackEvent(appliance="dishwasher", chosen_option="best", response="yes"),
        FeedbackEvent(appliance="dryer", chosen_option="balanced", response="yes"),
        FeedbackEvent(appliance="ev_charger", chosen_option="convenient", response="different_time"),
    ]

    print(f"start: {weights.model_dump()}")
    for event in events:
        weights = update_user_weights(weights, event)
        print(f"{event.response}/{event.chosen_option}: {weights.model_dump()}")
