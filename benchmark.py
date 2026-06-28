import random
import time
from engine.board import Board
from ai.minimax import find_best_move


def random_move(board):
    """A baseline 'dumb' bot that just picks any legal move at random."""
    return random.choice(board.get_valid_moves())


def play_one_game(minimax_depth, minimax_player=1):
    """
    Play one full game: minimax bot vs random bot.
    Returns (winner, total_minimax_thinking_time_seconds).
    """
    board = Board()
    current_player = 1
    total_time = 0.0

    while True:
        valid_moves = board.get_valid_moves()
        if not valid_moves:
            return None, total_time  # draw

        if current_player == minimax_player:
            start = time.time()
            col = find_best_move(board, minimax_player, depth=minimax_depth)
            total_time += time.time() - start
        else:
            col = random_move(board)

        board.drop_piece(col, current_player)
        winner = board.check_winner()
        if winner:
            return winner, total_time

        current_player = 2 if current_player == 1 else 1


def run_benchmark(depth, num_games=20):
    wins = 0
    losses = 0
    draws = 0
    total_time = 0.0

    for _ in range(num_games):
        winner, game_time = play_one_game(minimax_depth=depth, minimax_player=1)
        total_time += game_time
        if winner == 1:
            wins += 1
        elif winner == 2:
            losses += 1
        else:
            draws += 1

    avg_time = total_time / num_games
    win_rate = (wins / num_games) * 100

    print(f"Depth {depth}: {wins}W / {losses}L / {draws}D out of {num_games} games "
          f"| Win rate: {win_rate:.1f}% | Avg thinking time/game: {avg_time:.3f}s")


if __name__ == "__main__":
    for depth in [2, 4, 6]:
        run_benchmark(depth, num_games=20)