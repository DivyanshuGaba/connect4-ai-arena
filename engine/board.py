class Board:
    # A Connect 4 board is 6 rows tall and 7 columns wide
    ROWS = 6
    COLS = 7

    def __init__(self):
        # The grid is a list of 6 rows, each row a list of 7 cells
        # 0 = empty, 1 = player 1's piece, 2 = player 2's piece
        self.grid = [[0 for _ in range(self.COLS)] for _ in range(self.ROWS)]

    def is_valid_move(self, col):
        """Can a piece be dropped into this column?"""
        if col < 0 or col >= self.COLS:
            return False
        # If the top row of this column is still empty, the column isn't full
        return self.grid[0][col] == 0

    def drop_piece(self, col, player):
        """
        Drop a piece for `player` (1 or 2) into column `col`.
        Pieces fall to the lowest empty spot (like gravity).
        Returns the row it landed in, or None if the move was invalid.
        """
        if not self.is_valid_move(col):
            return None

        # Start from the bottom row and move up until we find an empty cell
        for row in range(self.ROWS - 1, -1, -1):
            if self.grid[row][col] == 0:
                self.grid[row][col] = player
                return row
        return None

    def get_valid_moves(self):
        """Return a list of all columns you're currently allowed to play."""
        return [col for col in range(self.COLS) if self.is_valid_move(col)]

    def print_board(self):
        """Print the board so you can see it in the terminal."""
        for row in self.grid:
            print(' | '.join(str(cell) for cell in row))
        print('-' * (self.COLS * 4))
        
    def check_winner(self):
        """
        Check if someone has won.
        Returns 1 if player 1 won, 2 if player 2 won, None if no winner yet.
        """
        # Check every cell on the board as a possible "starting point" of a win
        for row in range(self.ROWS):
            for col in range(self.COLS):
                player = self.grid[row][col]
                if player == 0:
                    continue  # empty cell, skip it

                # Check 4 directions from this cell: right, down, down-right, down-left
                if self._check_direction(row, col, player, 0, 1):   # horizontal →
                    return player
                if self._check_direction(row, col, player, 1, 0):   # vertical ↓
                    return player
                if self._check_direction(row, col, player, 1, 1):   # diagonal ↘
                    return player
                if self._check_direction(row, col, player, 1, -1):  # diagonal ↙
                    return player

        return None

    def _check_direction(self, row, col, player, row_step, col_step):
        """
        Check if there are 4 in a row starting at (row, col),
        moving in the direction (row_step, col_step).
        """
        for i in range(4):
            r = row + i * row_step
            c = col + i * col_step

            # Make sure we don't go off the board
            if r < 0 or r >= self.ROWS or c < 0 or c >= self.COLS:
                return False

            if self.grid[r][c] != player:
                return False

        return True

    def is_draw(self):
        """Board is full and nobody has won = draw."""
        return self.check_winner() is None and len(self.get_valid_moves()) == 0