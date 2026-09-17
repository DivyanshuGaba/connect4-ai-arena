from games.connect4.state import Connect4State
from games.connect4.heuristics import score_position
from ai.minimax import find_best_move
from ai.mcts import mcts_move


def test_minimax_takes_immediate_win():
    # Player 1 has three in a row at columns 0,1,2 -- column 3 wins immediately
    s = Connect4State()
    for col in [0, 4, 1, 4, 2, 4]:
        s = s.apply(col)
    assert s.current_player == 1
    col = find_best_move(s, ai_player=1, heuristic_fn=score_position, depth=4)
    assert col == 3

    result = s.apply(col).result()
    assert result == 1


def test_minimax_blocks_opponent_win():
    # Player 2 (opponent) has three in a row at columns 0,1,2 and it's
    # player 1's turn -- a correct AI must block at column 3.
    s = Connect4State()
    for col in [4, 0, 5, 1, 6, 2]:
        s = s.apply(col)
    assert s.current_player == 1
    col = find_best_move(s, ai_player=1, heuristic_fn=score_position, depth=4)
    assert col == 3


def test_mcts_returns_a_legal_move():
    s = Connect4State()
    col = mcts_move(s, iterations=100)
    assert col in s.legal_moves()


def test_mcts_takes_immediate_win():
    s = Connect4State()
    for col in [0, 4, 1, 4, 2, 4]:
        s = s.apply(col)
    assert s.current_player == 1
    col = mcts_move(s, iterations=300)
    assert col == 3
