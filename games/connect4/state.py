"""
Connect 4, implemented behind the GameState interface.

This replaces engine/board.py as the source of truth for game rules. The
old Board class mutated a grid in place (drop_piece(col, player)); this
version is immutable (apply(move) -> new Connect4State), which is what the
game-agnostic Minimax/MCTS in ai/ are written against.
"""

from copy import deepcopy
from typing import Optional

from games.base import GameState

ROWS = 6
COLS = 7


class Connect4State(GameState):
    __slots__ = ("grid", "_current_player")

    def __init__(self, grid: Optional[list[list[int]]] = None, current_player: int = 1):
        # grid: 6 rows x 7 cols, 0 = empty, 1 = player 1, 2 = player 2
        self.grid = grid if grid is not None else [[0] * COLS for _ in range(ROWS)]
        self._current_player = current_player

    @property
    def current_player(self) -> int:
        return self._current_player

    def legal_moves(self) -> list[int]:
        """Columns that aren't full yet."""
        return [col for col in range(COLS) if self.grid[0][col] == 0]

    def apply(self, move: int) -> "Connect4State":
        """Drop current_player's piece into `move` (a column index)."""
        if move not in self.legal_moves():
            raise ValueError(f"Illegal move: column {move}")

        new_grid = deepcopy(self.grid)
        for row in range(ROWS - 1, -1, -1):
            if new_grid[row][move] == 0:
                new_grid[row][move] = self._current_player
                break

        next_player = 2 if self._current_player == 1 else 1
        return Connect4State(new_grid, next_player)

    def result(self) -> Optional[int]:
        winner = self._check_winner()
        if winner is not None:
            return winner
        if not self.legal_moves():
            return 0  # draw
        return None

    def _check_winner(self) -> Optional[int]:
        """Returns 1 or 2 if that player has four in a row, else None."""
        for row in range(ROWS):
            for col in range(COLS):
                player = self.grid[row][col]
                if player == 0:
                    continue
                if (
                    self._check_direction(row, col, player, 0, 1)   # horizontal
                    or self._check_direction(row, col, player, 1, 0)   # vertical
                    or self._check_direction(row, col, player, 1, 1)   # diagonal down-right
                    or self._check_direction(row, col, player, 1, -1)  # diagonal down-left
                ):
                    return player
        return None

    def _check_direction(self, row, col, player, row_step, col_step) -> bool:
        for i in range(4):
            r, c = row + i * row_step, col + i * col_step
            if r < 0 or r >= ROWS or c < 0 or c >= COLS:
                return False
            if self.grid[r][c] != player:
                return False
        return True

    # --- convenience methods used by the API/frontend layer, not by the AI ---

    def is_draw(self) -> bool:
        return self.result() == 0

    def winner(self) -> Optional[int]:
        """None if the game isn't over OR it's a draw; use result() to tell those apart."""
        r = self.result()
        return r if r and r != 0 else None
