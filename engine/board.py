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