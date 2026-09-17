from games.connect4.state import Connect4State, ROWS, COLS


def test_empty_state_has_all_zeros():
    s = Connect4State()
    for row in s.grid:
        for cell in row:
            assert cell == 0


def test_apply_does_not_mutate_original():
    s = Connect4State()
    s2 = s.apply(3)
    # original untouched -- this is the point of the immutable interface
    assert s.grid[5][3] == 0
    assert s2.grid[5][3] == 1


def test_piece_lands_at_bottom():
    s = Connect4State().apply(3)
    assert s.grid[5][3] == 1


def test_pieces_stack_correctly():
    s = Connect4State().apply(3).apply(3)
    assert s.grid[5][3] == 1
    assert s.grid[4][3] == 2


def test_illegal_move_raises():
    s = Connect4State()
    for _ in range(6):
        s = s.apply(0)
    assert 0 not in s.legal_moves()
    try:
        s.apply(0)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_current_player_alternates():
    s = Connect4State()
    assert s.current_player == 1
    s = s.apply(0)
    assert s.current_player == 2
    s = s.apply(1)
    assert s.current_player == 1


def test_horizontal_win():
    s = Connect4State()
    for col in [0, 0, 1, 1, 2, 2, 3]:
        s = s.apply(col)
    assert s.result() == 1


def test_vertical_win():
    s = Connect4State()
    for col in [0, 1, 0, 1, 0, 1, 0]:
        s = s.apply(col)
    assert s.result() == 1


def test_no_result_on_empty_board():
    assert Connect4State().result() is None


def test_draw_when_board_full_no_winner():
    # A full board with no four-in-a-row anywhere, built directly via the
    # constructor since apply() enforces real turn alternation and can't
    # place an arbitrary player at an arbitrary cell.
    grid = [
        [1, 1, 2, 1, 2, 1, 1],
        [2, 2, 2, 1, 1, 2, 2],
        [2, 2, 1, 2, 2, 2, 1],
        [2, 2, 1, 2, 1, 1, 1],
        [1, 1, 1, 2, 2, 1, 2],
        [2, 1, 2, 1, 1, 2, 1],
    ]
    assert len(grid) == ROWS and all(len(row) == COLS for row in grid)
    s = Connect4State(grid=grid, current_player=1)
    assert s.result() == 0
    assert s.is_draw() is True
