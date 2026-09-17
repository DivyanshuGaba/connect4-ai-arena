"""
Game-agnostic interface.

Every game (Connect 4 today, Chess later) implements `GameState`. Minimax and
MCTS are written ONLY against this interface — they never import Board,
grid, columns, or anything Connect4-specific. That's what lets a second game
(e.g. Chess via python-chess) drop in later without touching ai/minimax.py
or ai/mcts.py at all.

Design choices worth knowing about if you extend this:

- `apply(move)` returns a NEW state and does not mutate `self`. This matches
  how python-chess's `board.copy()` + `push(move)` will be wrapped later,
  and it means the search algorithms never need to worry about undoing a
  move — they just discard the branch. The cost is a copy per move, which
  is fine at Connect4/Chess search depths for a project like this; if you
  ever profile this as the bottleneck, a push/undo variant is the fix, not
  a redesign of this interface.
- `current_player` is 1 or 2. Draws are represented as `result() == 0`,
  distinct from `None` ("game still in progress"). Don't conflate the two —
  `0` is falsy in Python, so `if state.result():` silently treats a draw
  like "no result yet". Always compare with `is not None`.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional


class GameState(ABC):
    """A two-player, zero-sum, perfect-information game state."""

    @property
    @abstractmethod
    def current_player(self) -> int:
        """Whose turn it is to move from this state: 1 or 2."""

    @abstractmethod
    def legal_moves(self) -> list[Any]:
        """All legal moves from this state. Empty list if the game has ended."""

    @abstractmethod
    def apply(self, move: Any) -> "GameState":
        """
        Return the NEW state after `current_player` plays `move`.
        Must raise ValueError for an illegal move. Must not mutate self.
        """

    @abstractmethod
    def result(self) -> Optional[int]:
        """
        1 or 2 if that player has won, 0 for a draw,
        None if the game has not ended yet.
        """

    def is_terminal(self) -> bool:
        """True if the game has ended (a result exists, or no legal moves)."""
        return self.result() is not None
