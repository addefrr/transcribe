import unittest
from datetime import datetime, timezone

from worker.db import _advance_monthly_window, _next_month


class AllowanceWindowTests(unittest.TestCase):
    def test_next_month_clamps_end_of_month(self) -> None:
        self.assertEqual(
            _next_month(datetime(2027, 1, 31, 9, 30, tzinfo=timezone.utc)),
            datetime(2027, 2, 28, 9, 30, tzinfo=timezone.utc),
        )

    def test_advance_skips_every_elapsed_window(self) -> None:
        start, end = _advance_monthly_window(
            datetime(2026, 1, 10, tzinfo=timezone.utc),
            datetime(2026, 2, 10, tzinfo=timezone.utc),
            datetime(2026, 4, 12, tzinfo=timezone.utc),
        )
        self.assertEqual(start, datetime(2026, 4, 10, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2026, 5, 10, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
