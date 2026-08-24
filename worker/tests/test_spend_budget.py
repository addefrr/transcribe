import unittest

from worker.db import _spend_fits_budget, est_cost_cents


class SpendBudgetTests(unittest.TestCase):
    def test_allows_verified_trial_usage_before_first_payment(self) -> None:
        self.assertTrue(_spend_fits_budget(0, 500, 0, 1_000, 80))

    def test_allows_projection_exactly_at_budget(self) -> None:
        self.assertTrue(_spend_fits_budget(1_000, 700, 0, 100, 80))

    def test_rejects_even_fractional_overspend(self) -> None:
        self.assertFalse(_spend_fits_budget(1_000, 799.99, 0, 0.02, 80))

    def test_replaces_current_jobs_reservation_instead_of_double_counting(self) -> None:
        self.assertTrue(_spend_fits_budget(1_000, 780, 80, 100, 80))
        self.assertFalse(_spend_fits_budget(1_000, 780, 80, 101, 80))

    def test_spend_percentage_is_bounded(self) -> None:
        self.assertTrue(_spend_fits_budget(100, 0, 0, 1, -10))
        self.assertFalse(_spend_fits_budget(100, 0, 0, 1.01, -10))
        self.assertTrue(_spend_fits_budget(100, 0, 0, 100, 500))
        self.assertFalse(_spend_fits_budget(100, 0, 0, 100.01, 500))

    def test_cost_estimate_uses_whole_audio_minutes(self) -> None:
        job = {"cost_per_minute_cents": 0.25}
        self.assertEqual(est_cost_cents(1, job), 0.25)
        self.assertEqual(est_cost_cents(60, job), 0.25)
        self.assertEqual(est_cost_cents(60.001, job), 0.5)


if __name__ == "__main__":
    unittest.main()
