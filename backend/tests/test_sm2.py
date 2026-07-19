"""
Unit tests for the SM-2 spaced repetition algorithm.
"""

import pytest
from datetime import date, timedelta
from app.services.sm2 import calculate_sm2


class TestCalculateSm2:
    """Tests for the calculate_sm2 function."""

    # ── Incorrect answers (quality < 3) ──────────────────────────

    @pytest.mark.parametrize("quality", [0, 1, 2])
    def test_quality_less_than_3_resets_interval(self, quality):
        """Any quality < 3 should reset interval to 1 and rep_count to 0."""
        result = calculate_sm2(quality=quality, ef=2.5, interval=10, rep_count=5)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 0
        # next_review_date should be today + 1
        expected = (date.today() + timedelta(days=1)).isoformat()
        assert result["next_review_date"] == expected

    @pytest.mark.parametrize("quality", [0, 1, 2])
    def test_quality_less_than_3_resets_from_zero_state(self, quality):
        """Reset also works when starting from initial state."""
        result = calculate_sm2(quality=quality, ef=2.5, interval=0, rep_count=0)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 0

    # ── Correct answers (quality >= 3) ───────────────────────────

    def test_quality_3_first_review(self):
        """First correct review (rep_count=0) → interval=1, rep_count=1."""
        result = calculate_sm2(quality=3, ef=2.5, interval=0, rep_count=0)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 1

    def test_quality_3_second_review(self):
        """Second correct review (rep_count=1) → interval=6, rep_count=2."""
        result = calculate_sm2(quality=3, ef=2.5, interval=1, rep_count=1)
        assert result["new_interval"] == 6
        assert result["new_rep_count"] == 2

    def test_quality_3_third_review(self):
        """Third+ correct review → interval = round(interval * EF)."""
        result = calculate_sm2(quality=3, ef=2.5, interval=6, rep_count=2)
        # EF' = 2.5 + (0.1 - (5-3)*(0.08 + (5-3)*0.02)) = 2.5 - 0.14 = 2.36
        # interval = round(6 * 2.36) = 14
        assert result["new_interval"] == 14
        assert result["new_rep_count"] == 3
        expected = (date.today() + timedelta(days=14)).isoformat()
        assert result["next_review_date"] == expected

    # ── EF clamping ──────────────────────────────────────────────

    def test_ef_clamped_to_minimum_1_3(self):
        """EF should never go below 1.3."""
        # quality=0 causes a large EF decrease
        result = calculate_sm2(quality=0, ef=1.3, interval=1, rep_count=0)
        assert result["new_ef"] >= 1.3

    def test_ef_low_quality_low_ef(self):
        """Low quality with low EF still clamped to 1.3."""
        result = calculate_sm2(quality=1, ef=1.3, interval=1, rep_count=0)
        assert result["new_ef"] == 1.3

    def test_ef_quality_5_increases_ef(self):
        """Perfect recall (quality=5) should increase EF."""
        result = calculate_sm2(quality=5, ef=2.5, interval=6, rep_count=2)
        assert result["new_ef"] > 2.5

    # ── Multiple review cycles ───────────────────────────────────

    def test_consecutive_good_reviews(self):
        """Simulate several consecutive good reviews."""
        ef, interval, rep_count = 2.5, 0, 0
        qualities = [3, 4, 3, 5, 4]
        for i, q in enumerate(qualities):
            result = calculate_sm2(quality=q, ef=ef, interval=interval, rep_count=rep_count)
            ef = result["new_ef"]
            interval = result["new_interval"]
            rep_count = result["new_rep_count"]
            # After first correct, interval should be 1
            assert result["new_interval"] >= 1
            assert result["new_rep_count"] == i + 1  # rep_count increments each time
        # After 5 correct reviews, interval should be substantial
        assert interval > 30

    def test_reset_after_learning(self):
        """After a streak of correct answers, a wrong answer resets state."""
        ef, interval, rep_count = 2.5, 0, 0
        # Three good reviews
        for _ in range(3):
            result = calculate_sm2(quality=4, ef=ef, interval=interval, rep_count=rep_count)
            ef, interval, rep_count = result["new_ef"], result["new_interval"], result["new_rep_count"]
        assert rep_count == 3
        assert interval > 1
        # One bad review
        result = calculate_sm2(quality=0, ef=ef, interval=interval, rep_count=rep_count)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 0

    # ── Edge cases ───────────────────────────────────────────────

    def test_quality_0_resets(self):
        """Quality 0 (complete blackout) resets everything."""
        result = calculate_sm2(quality=0, ef=2.5, interval=30, rep_count=10)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 0

    def test_quality_5_increases_interval_substantially(self):
        """Quality 5 should produce a larger interval than quality 3 (via higher EF)."""
        result_easy = calculate_sm2(quality=5, ef=2.5, interval=6, rep_count=2)
        result_good = calculate_sm2(quality=3, ef=2.5, interval=6, rep_count=2)
        # With quality 5, EF increases, so interval grows more
        # quality 3: EF=2.36, interval=14; quality 5: EF=2.6, interval=16
        assert result_easy["new_interval"] > result_good["new_interval"]

    def test_quality_0_decreases_ef(self):
        """Quality 0 should decrease the EF from its initial value."""
        result = calculate_sm2(quality=0, ef=2.5, interval=6, rep_count=2)
        # EF should be lower than 2.5 (but clamped to 1.3)
        assert result["new_ef"] <= 2.5

    def test_invalid_quality_raises(self):
        """Quality outside 0-5 should raise ValueError."""
        with pytest.raises(ValueError):
            calculate_sm2(quality=-1, ef=2.5, interval=1, rep_count=0)
        with pytest.raises(ValueError):
            calculate_sm2(quality=6, ef=2.5, interval=1, rep_count=0)

    def test_negative_interval_handled(self):
        """Negative interval should be treated as 0."""
        result = calculate_sm2(quality=3, ef=2.5, interval=-5, rep_count=0)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 1

    def test_negative_rep_count_handled(self):
        """Negative rep_count should be treated as 0."""
        result = calculate_sm2(quality=3, ef=2.5, interval=0, rep_count=-3)
        assert result["new_interval"] == 1
        assert result["new_rep_count"] == 1

    # ── Return type checks ───────────────────────────────────────

    def test_next_review_date_is_iso_format(self):
        """next_review_date should be an ISO format date string."""
        result = calculate_sm2(quality=3, ef=2.5, interval=0, rep_count=0)
        assert isinstance(result["next_review_date"], str)
        # Verify it can be parsed
        parsed = date.fromisoformat(result["next_review_date"])
        assert parsed == date.today() + timedelta(days=1)

    def test_new_ef_is_rounded(self):
        """new_ef should be rounded to 2 decimal places."""
        result = calculate_sm2(quality=3, ef=2.5, interval=6, rep_count=2)
        assert isinstance(result["new_ef"], float)
        # Check precision
        assert result["new_ef"] == round(result["new_ef"], 2)

    def test_all_keys_present(self):
        """Result dict should contain all expected keys."""
        result = calculate_sm2(quality=3, ef=2.5, interval=0, rep_count=0)
        expected_keys = {"new_ef", "new_interval", "new_rep_count", "next_review_date"}
        assert set(result.keys()) == expected_keys