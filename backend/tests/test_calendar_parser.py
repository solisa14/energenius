from __future__ import annotations

import unittest
from datetime import date

from backend.app.services.calendar_parser import slot_range_for_interval


class CalendarParserTests(unittest.TestCase):
    def test_exact_half_hour_boundaries(self) -> None:
        slot_range = slot_range_for_interval(
            "2026-04-26T15:00:00-07:00",
            "2026-04-26T16:30:00-07:00",
            date(2026, 4, 26),
            "America/Phoenix",
        )
        self.assertEqual(slot_range, (30, 33))

    def test_partial_overlap_rounds_outward(self) -> None:
        slot_range = slot_range_for_interval(
            "2026-04-26T15:15:00-07:00",
            "2026-04-26T16:10:00-07:00",
            date(2026, 4, 26),
            "America/Phoenix",
        )
        self.assertEqual(slot_range, (30, 33))

    def test_cross_midnight_event_maps_to_following_day(self) -> None:
        slot_range = slot_range_for_interval(
            "2026-04-26T23:30:00-07:00",
            "2026-04-27T01:00:00-07:00",
            date(2026, 4, 27),
            "America/Phoenix",
        )
        self.assertEqual(slot_range, (0, 2))


if __name__ == "__main__":
    unittest.main()
