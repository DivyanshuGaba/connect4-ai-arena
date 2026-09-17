from games.connect4.state import Connect4State
from games.connect4.heuristics import score_position
from ai.minimax import find_best_move


def print_board(state):
    for row in state.grid:
        print(' | '.join(str(cell) for cell in row))
    print('-' * (len(state.grid[0]) * 4))


def main():
    state = Connect4State()
    human_player = 1
    ai_player = 2

    print("Welcome to Connect 4! You are Player 1 (X). The AI is Player 2 (O).")
    print_board(state)

    while True:
        result = state.result()
        if result is not None:
            print("It's a draw!" if result == 0 else f"Player {result} wins!")
            break

        current_player = state.current_player
        valid_moves = state.legal_moves()

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
            col = find_best_move(state, ai_player, heuristic_fn=score_position, depth=5)
            print(f"AI chooses column {col}")

        state = state.apply(col)
        print_board(state)


if __name__ == "__main__":
    main()
