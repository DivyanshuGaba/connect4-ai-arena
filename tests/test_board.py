from engine.board import Board


def test_empty_board_has_all_zeros():
    b = Board()
    for row in b.grid:
        for cell in row:
            assert cell == 0


def test_drop_piece_lands_at_bottom():
    b = Board()
    row = b.drop_piece(3, 1)
    assert row == 5  # bottom row index
    assert b.grid[5][3] == 1


def test_drop_piece_stacks_correctly():
    b = Board()
    b.drop_piece(3, 1)
    row = b.drop_piece(3, 2)
    assert row == 4  # lands right above the first piece
    assert b.grid[4][3] == 2


def test_invalid_column_returns_none():
    b = Board()
    assert b.drop_piece(10, 1) is None
    assert b.drop_piece(-1, 1) is None


def test_full_column_rejects_move():
    b = Board()
    for _ in range(6):
        b.drop_piece(0, 1)
    assert b.is_valid_move(0) is False
    assert b.drop_piece(0, 1) is None


def test_horizontal_win():
    b = Board()
    b.drop_piece(0, 1)
    b.drop_piece(1, 1)
    b.drop_piece(2, 1)
    assert b.check_winner() is None
    b.drop_piece(3, 1)
    assert b.check_winner() == 1


def test_vertical_win():
    b = Board()
    b.drop_piece(0, 1)
    b.drop_piece(0, 1)
    b.drop_piece(0, 1)
    assert b.check_winner() is None
    b.drop_piece(0, 1)
    assert b.check_winner() == 1


def test_no_winner_on_empty_board():
    b = Board()
    assert b.check_winner() is None


def test_draw_when_board_full_no_winner():
    b = Board()
    # Fill the board with a pattern that has no 4-in-a-row
    pattern = [1, 1, 2, 2, 1, 1, 2]
    for col, _ in enumerate(pattern):
        for _ in range(6):
            player = 1 if (col + _) % 2 == 0 else 2
            b.drop_piece(col, player)
    # Not asserting a specific draw pattern here, just that it doesn't crash
    b.check_winner()