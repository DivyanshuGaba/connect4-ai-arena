def evaluate_window(window, player):
    """
    Score a single "window" of 4 cells, from `player`'s point of view.
    A window can be horizontal, vertical, or diagonal.
    """
    opponent = 2 if player == 1 else 1
    score = 0

    player_count = window.count(player)
    opponent_count = window.count(opponent)
    empty_count = window.count(0)

    if player_count == 4:
        score += 100          # this window is an actual win
    elif player_count == 3 and empty_count == 1:
        score += 5            # 3 in a row with a way to complete it — strong
    elif player_count == 2 and empty_count == 2:
        score += 2            # 2 in a row — minor advantage

    if opponent_count == 3 and empty_count == 1:
        score -= 4            # opponent is one move from winning — danger

    return score


def score_position(board, player):
    """
    Score the entire board from `player`'s perspective.
    Higher score = better position for `player`.
    """
    score = 0
    grid = board.grid
    rows = board.ROWS
    cols = board.COLS

    # Center column control — center pieces open up more future windows
    center_col = cols // 2
    center_array = [grid[r][center_col] for r in range(rows)]
    score += center_array.count(player) * 3

    # Horizontal windows
    for r in range(rows):
        for c in range(cols - 3):
            window = grid[r][c:c + 4]
            score += evaluate_window(window, player)

    # Vertical windows
    for c in range(cols):
        col_array = [grid[r][c] for r in range(rows)]
        for r in range(rows - 3):
            window = col_array[r:r + 4]
            score += evaluate_window(window, player)

    # Diagonal windows (down-right ↘)
    for r in range(rows - 3):
        for c in range(cols - 3):
            window = [grid[r + i][c + i] for i in range(4)]
            score += evaluate_window(window, player)

    # Diagonal windows (down-left ↙)
    for r in range(rows - 3):
        for c in range(3, cols):
            window = [grid[r + i][c - i] for i in range(4)]
            score += evaluate_window(window, player)

    return score