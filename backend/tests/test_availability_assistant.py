from __future__ import annotations

import unittest

from backend.app.services.availability_assistant import (
    _heuristic_chat_decision,
    _state_from_text,
)
from backend.app.services.calendar_parser import apply_slot_change
from backend.app.services.scoring import score_slot
from backend.app.models.schemas import ApplianceConfig, UserWeights


class AvailabilityAssistantTests(unittest.TestCase):
    def test_parses_explicit_home_away_request(self) -> None:
        decision = _heuristic_chat_decision(
            "I won't be home tomorrow from 3 to 5.",
            "America/Phoenix",
        )
        self.assertEqual(decision.kind, "apply_availability_change")
        self.assertFalse(decision.set_home)
        self.assertEqual((decision.start_slot, decision.end_slot), (30, 34))

    def test_asks_for_clarification_on_vague_time(self) -> None:
        decision = _heuristic_chat_decision(
            "I won't be home tomorrow after lunch.",
            "America/Phoenix",
        )
        self.assertEqual(decision.kind, "ask_clarification")
        self.assertIn("time range", decision.summary.lower())

    def test_pending_reply_detects_home_answer(self) -> None:
        self.assertEqual(_state_from_text("Yeah, I'll be home."), "home")

    def test_apply_slot_change_sets_exact_window(self) -> None:
        slots = [False] * 48
        updated = apply_slot_change(slots, 10, 12, True)
        self.assertTrue(updated[10])
        self.assertTrue(updated[11])
        self.assertFalse(updated[9])
        self.assertFalse(updated[12])

    def test_presence_required_slot_is_invalid_when_away(self) -> None:
        score = score_slot(
            18,
            ApplianceConfig(
                id="dishwasher",
                name="Dishwasher",
                duration=2,
                powerKw=1.3,
                earliestStart=0,
                latestFinish=48,
                isNoisy=True,
                requiresPresence=True,
                satisfactionByTime={str(i): 0.7 for i in range(48)},
            ),
            prices=[0.1] * 48,
            carbon=[0.2] * 48,
            weights=UserWeights(cost=0.4, emissions=0.2, satisfaction=0.4),
            availability=[False if 18 <= idx < 20 else True for idx in range(48)],
        )
        self.assertEqual(score, 1.0)


if __name__ == "__main__":
    unittest.main()
