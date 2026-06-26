import math
from copy import deepcopy
from ai.heuristics import score_position


def is_terminal_node(board):
    """Game over = someone won, or no moves left (draw)."""
    return board.check_winner() is not None or len(board.get_valid_moves()) == 0


def minimax(board, depth, alpha, beta, maximizing_player, ai_player):
    opponent = 2 if ai_player == 1 else 1
    valid_moves = board.get_valid_moves()
    winner = board.check_winner()

    # Base case: we've searched deep enough, or the game has ended
    if depth == 0 or is_terminal_node(board):
        if winner == ai_player:
            return (None, 1_000_000)        # AI wins this line — best possible
        elif winner == opponent:
            return (None, -1_000_000)       # opponent wins this line — worst possible
        elif len(valid_moves) == 0:
            return (None, 0)                # draw
        else:
            return (None, score_position(board, ai_player))  # ran out of depth, use heuristic

    if maximizing_player:
        # AI's turn — trying to maximize score
        value = -math.inf
        best_col = valid_moves[0]
        for col in valid_moves:
            board_copy = deepcopy(board)
            board_copy.drop_piece(col, ai_player)
            _, new_score = minimax(board_copy, depth - 1, alpha, beta, False, ai_player)
            if new_score > value:
                value = new_score
                best_col = col
            alpha = max(alpha, value)
            if alpha >= beta:
                break  # prune — opponent would never let us reach this branch
        return best_col, value
    else:
        # Opponent's turn — trying to minimize AI's score
        value = math.inf
        best_col = valid_moves[0]
        for col in valid_moves:
            board_copy = deepcopy(board)
            board_copy.drop_piece(col, opponent)
            _, new_score = minimax(board_copy, depth - 1, alpha, beta, True, ai_player)
            if new_score < value:
                value = new_score
                best_col = col
            beta = min(beta, value)
            if alpha >= beta:
                break  # prune
        return best_col, value


def find_best_move(board, ai_player, depth=5):
    """The function the rest of the app will actually call."""
    best_col, _ = minimax(board, depth, -math.inf, math.inf, True, ai_player)
    return best_col