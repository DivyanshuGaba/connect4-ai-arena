"""
Elo rating calculation. Pure math, no I/O -- callers read the current
ratings, compute the update, and write the results back themselves.
"""

K_FACTOR = 32
DEFAULT_ELO = 1200


def expected_score(rating_a: float, rating_b: float) -> float:
    """Probability that player A beats player B, per the standard Elo formula."""
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))


def update_ratings(rating_a: float, rating_b: float, result_a: float) -> tuple[int, int]:
    """
    result_a: 1.0 if A won, 0.0 if A lost, 0.5 for a draw.
    Returns (new_rating_a, new_rating_b), rounded to the nearest integer.
    """
    expected_a = expected_score(rating_a, rating_b)
    expected_b = 1 - expected_a
    result_b = 1 - result_a

    new_a = rating_a + K_FACTOR * (result_a - expected_a)
    new_b = rating_b + K_FACTOR * (result_b - expected_b)
    return round(new_a), round(new_b)