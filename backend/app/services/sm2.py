"""
SM-2 Spaced Repetition Algorithm

Quality ratings (0-5):
  0 = Again (complete blackout)
  1 = Hard (incorrect but familiar)
  2 = Medium (incorrect but close)
  3 = Good (correct with hesitation)
  4 = VeryGood (correct, fairly smooth)
  5 = Easy (perfect recall)
"""

from datetime import date, timedelta


def calculate_sm2(quality: int, ef: float, interval: int, rep_count: int) -> dict:
    """
    Calculate new SM-2 parameters based on the given quality rating.

    Args:
        quality: User's self-assessed recall quality (0-5).
        ef:     Current easiness factor (minimum 1.3).
        interval: Current interval in days.
        rep_count: Current repetition count.

    Returns:
        dict with keys: new_ef, new_interval, new_rep_count, next_review_date (ISO format).
    """
    if not (0 <= quality <= 5):
        raise ValueError(f"quality must be between 0 and 5, got {quality}")

    # --- Clamp incoming EF ---
    ef = max(1.3, ef)
    if interval < 0:
        interval = 0
    if rep_count < 0:
        rep_count = 0

    if quality < 3:
        # Incorrect: reset
        new_ef = _calculate_ef(ef, quality)
        new_interval = 1
        new_rep_count = 0
    else:
        # Correct: advance
        new_ef = _calculate_ef(ef, quality)
        if rep_count == 0:
            new_interval = 1
        elif rep_count == 1:
            new_interval = 6
        else:
            new_interval = round(interval * new_ef)
        new_rep_count = rep_count + 1

    # Ensure no zero / negative interval for correct answers
    if new_interval < 1:
        new_interval = 1

    next_review = date.today() + timedelta(days=new_interval)

    return {
        "new_ef": round(new_ef, 2),
        "new_interval": new_interval,
        "new_rep_count": new_rep_count,
        "next_review_date": next_review.isoformat(),
    }


def _calculate_ef(ef: float, quality: int) -> float:
    """
    Compute the new easiness factor.

    EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    EF' = max(1.3, EF')
    """
    new_ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return max(1.3, new_ef)