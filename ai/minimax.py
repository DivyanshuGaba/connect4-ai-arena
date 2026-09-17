"""
Minimax with alpha-beta pruning, written against the GameState interface.

This file has no idea what Connect 4 or Chess is -- it only calls
state.legal_moves(), state.apply(move), state.result(), and a
heuristic_fn(state, player) that the caller supplies. That's what lets the
exact same algorithm serve any game plugged in behind games/base.py.
"""

import math
from typing import Any, Callable, Optional

from games.base import GameState

HeuristicFn = Callable[[GameState, int], float]

WIN_SCORE = 1_000_000


def _minimax(
    state: GameState,
    depth: int,
    alpha: float,
    beta: float,
    maximizing_player: bool,
    ai_player: int,
    heuristic_fn: HeuristicFn,
) -> tuple[Optional[Any], float]:
    opponent = 2 if ai_player == 1 else 1
    result = state.result()

    # Base case: game over, or we've searched deep enough
    if result is not None or depth == 0:
        if result == ai_player:
            return None, WIN_SCORE
        elif result == opponent:
            return None, -WIN_SCORE
        elif result == 0:  # draw
            return None, 0
        else:  # depth exhausted, game still ongoing -- fall back to heuristic
            return None, heuristic_fn(state, ai_player)

    legal_moves = state.legal_moves()
    best_move = legal_moves[0]

    if maximizing_player:
        value = -math.inf
        for move in legal_moves:
            _, new_score = _minimax(
                state.apply(move), depth - 1, alpha, beta, False, ai_player, heuristic_fn
            )
            if new_score > value:
                value, best_move = new_score, move
            alpha = max(alpha, value)
            if alpha >= beta:
                break  # opponent would never let us reach this branch
        return best_move, value
    else:
        value = math.inf
        for move in legal_moves:
            _, new_score = _minimax(
                state.apply(move), depth - 1, alpha, beta, True, ai_player, heuristic_fn
            )
            if new_score < value:
                value, best_move = new_score, move
            beta = min(beta, value)
            if alpha >= beta:
                break
        return best_move, value


def find_best_move(
    state: GameState,
    ai_player: int,
    heuristic_fn: HeuristicFn,
    depth: int = 5,
) -> Any:
    """The function the rest of the app calls. Returns the chosen move."""
    best_move, _ = _minimax(state, depth, -math.inf, math.inf, True, ai_player, heuristic_fn)
    return best_move
