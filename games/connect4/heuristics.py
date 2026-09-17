"""
Connect 4 position evaluation. This is Connect4-specific and is injected
into Minimax as a `heuristic_fn(state, player) -> float`, rather than being
imported by ai/minimax.py directly — that's what keeps Minimax game-agnostic.
"""

from games.connect4.state import Connect4State, ROWS, COLS


def evaluate_window(window: list[int], player: int) -> int:
    """Score a single "window" of 4 cells, from `player`'s point of view."""
    opponent = 2 if player == 1 else 1
    score = 0

    player_count = window.count(player)
    opponent_count = window.count(opponent)
    empty_count = window.count(0)

    if player_count == 4:
        score += 100          # actual win
    elif player_count == 3 and empty_count == 1:
        score += 5            # 3 in a row with a way to complete it
    elif player_count == 2 and empty_count == 2:
        score += 2            # minor advantage

    if opponent_count == 3 and empty_count == 1:
        score -= 4            # opponent is one move from winning

    return score


def score_position(state: Connect4State, player: int) -> float:
    """Score the entire board from `player`'s perspective. Higher = better."""
    score = 0
    grid = state.grid

    # Center column control
    center_col = COLS // 2
    center_array = [grid[r][center_col] for r in range(ROWS)]
    score += center_array.count(player) * 3

    # Horizontal windows
    for r in range(ROWS):
        for c in range(COLS - 3):
            score += evaluate_window(grid[r][c:c + 4], player)

    # Vertical windows
    for c in range(COLS):
        col_array = [grid[r][c] for r in range(ROWS)]
        for r in range(ROWS - 3):
            score += evaluate_window(col_array[r:r + 4], player)

    # Diagonal windows (down-right)
    for r in range(ROWS - 3):
        for c in range(COLS - 3):
            score += evaluate_window([grid[r + i][c + i] for i in range(4)], player)

    # Diagonal windows (down-left)
    for r in range(ROWS - 3):
        for c in range(3, COLS):
            score += evaluate_window([grid[r + i][c - i] for i in range(4)], player)

    return score
