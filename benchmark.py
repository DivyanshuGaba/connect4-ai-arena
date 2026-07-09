import random
import time
from engine.board import Board
from ai.minimax import find_best_move
from ai.mcts import mcts_move


def random_move(board):
    return random.choice(board.get_valid_moves())


def play_one_game(player1_fn, player2_fn):
    """
    Play one game between two AI functions.
    Returns winner (1, 2, or None for draw) and total time per player.
    """
    board = Board()
    current_player = 1
    times = {1: 0.0, 2: 0.0}
    fns = {1: player1_fn, 2: player2_fn}

    while True:
        if not board.get_valid_moves():
            return None, times

        start = time.time()
        col = fns[current_player](board)
        times[current_player] += time.time() - start

        board.drop_piece(col, current_player)

        winner = board.check_winner()
        if winner:
            return winner, times

        current_player = 2 if current_player == 1 else 1


def run_matchup(name, player1_fn, player2_fn, num_games=20):
    p1_wins = p2_wins = draws = 0
    total_time_p1 = total_time_p2 = 0.0

    for _ in range(num_games):
        winner, times = play_one_game(player1_fn, player2_fn)
        total_time_p1 += times[1]
        total_time_p2 += times[2]
        if winner == 1:
            p1_wins += 1
        elif winner == 2:
            p2_wins += 1
        else:
            draws += 1

    print(f"\n{name} ({num_games} games)")
    print(f"  Player 1 wins : {p1_wins}")
    print(f"  Player 2 wins : {p2_wins}")
    print(f"  Draws         : {draws}")
    print(f"  Avg time P1   : {total_time_p1/num_games:.3f}s/game")
    print(f"  Avg time P2   : {total_time_p2/num_games:.3f}s/game")


if __name__ == "__main__":
    minimax_d4 = lambda b: find_best_move(b, ai_player=1, depth=4)
    minimax_d4_p2 = lambda b: find_best_move(b, ai_player=2, depth=4)
    mcts_500 = lambda b: mcts_move(b, ai_player=1, iterations=500)
    mcts_500_p2 = lambda b: mcts_move(b, ai_player=2, iterations=500)
    random_p1 = lambda b: random_move(b)
    random_p2 = lambda b: random_move(b)

    print("=" * 50)
    print("CONNECT 4 — ALGORITHM BENCHMARK")
    print("=" * 50)

    run_matchup(
        "Minimax (depth 4) vs Random",
        minimax_d4, random_p2
    )

    run_matchup(
        "MCTS (500 iterations) vs Random",
        mcts_500, random_p2
    )

    run_matchup(
        "Minimax (depth 4) vs MCTS (500 iterations)",
        minimax_d4, mcts_500_p2
    )

    print("\n" + "=" * 50)