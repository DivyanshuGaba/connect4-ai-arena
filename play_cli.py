from engine.board import Board
from ai.minimax import find_best_move


def main():
    board = Board()
    human_player = 1
    ai_player = 2

    print("Welcome to Connect 4! You are Player 1 (X). The AI is Player 2 (O).")
    board.print_board()

    current_player = human_player

    while True:
        valid_moves = board.get_valid_moves()
        if not valid_moves:
            print("It's a draw!")
            break

        if current_player == human_player:
            move = input(f"Your turn, choose a column {valid_moves}: ")
            try:
                col = int(move)
            except ValueError:
                print("Please enter a number.")
                continue
            if col not in valid_moves:
                print("That column isn't valid. Try again.")
                continue
        else:
            print("AI is thinking...")
            col = find_best_move(board, ai_player, depth=5)
            print(f"AI chooses column {col}")

        board.drop_piece(col, current_player)
        board.print_board()

        winner = board.check_winner()
        if winner:
            print(f"Player {winner} wins!")
            break

        current_player = ai_player if current_player == human_player else human_player


if __name__ == "__main__":
    main()