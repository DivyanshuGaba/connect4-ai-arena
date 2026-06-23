from engine.board import Board


def main():
    board = Board()
    current_player = 1

    print("Welcome to Connect 4! Player 1 = X, Player 2 = O")
    board.print_board()

    while True:
        valid_moves = board.get_valid_moves()
        if not valid_moves:
            print("It's a draw!")
            break

        move = input(f"Player {current_player}, choose a column {valid_moves}: ")

        try:
            col = int(move)
        except ValueError:
            print("Please enter a number.")
            continue

        if col not in valid_moves:
            print("That column isn't valid. Try again.")
            continue

        board.drop_piece(col, current_player)
        board.print_board()

        winner = board.check_winner()
        if winner:
            print(f"Player {winner} wins!")
            break

        current_player = 2 if current_player == 1 else 1


if __name__ == "__main__":
    main()