import math
import random
from copy import deepcopy


class MCTSNode:
    def __init__(self, board, player, parent=None, move=None):
        self.board = board        # board state at this node
        self.player = player      # whose turn it is
        self.parent = parent      # parent node
        self.move = move          # move that led to this node
        self.children = []        # child nodes
        self.wins = 0             # wins from simulations through this node
        self.visits = 0           # total simulations through this node
        self.untried_moves = board.get_valid_moves()

    def is_fully_expanded(self):
        return len(self.untried_moves) == 0

    def is_terminal(self):
        return self.board.check_winner() is not None or len(self.board.get_valid_moves()) == 0

    def ucb1(self, exploration=1.41):
        """
        Upper Confidence Bound formula.
        Balances exploitation (winning nodes) vs exploration (less visited nodes).
        """
        if self.visits == 0:
            return float('inf')
        return (self.wins / self.visits) + exploration * math.sqrt(
            math.log(self.parent.visits) / self.visits
        )

    def best_child(self):
        return max(self.children, key=lambda c: c.ucb1())

    def most_visited_child(self):
        """After all simulations, pick the move visited most — most reliable."""
        return max(self.children, key=lambda c: c.visits)


def mcts_move(board, ai_player, iterations=500):
    """
    Run MCTS for `iterations` simulations and return the best column to play.
    """
    root = MCTSNode(deepcopy(board), ai_player)

    for _ in range(iterations):
        node = root

        # 1. SELECTION — follow best UCB1 child until we find an unexpanded node
        while node.is_fully_expanded() and not node.is_terminal():
            node = node.best_child()

        # 2. EXPANSION — add one new child from an untried move
        if not node.is_terminal() and node.untried_moves:
            move = random.choice(node.untried_moves)
            node.untried_moves.remove(move)

            new_board = deepcopy(node.board)
            new_board.drop_piece(move, node.player)
            next_player = 2 if node.player == 1 else 1

            child = MCTSNode(new_board, next_player, parent=node, move=move)
            node.children.append(child)
            node = child

        # 3. SIMULATION — play out randomly from this node until game ends
        sim_board = deepcopy(node.board)
        sim_player = node.player

        while True:
            winner = sim_board.check_winner()
            moves = sim_board.get_valid_moves()
            if winner or not moves:
                break
            col = random.choice(moves)
            sim_board.drop_piece(col, sim_player)
            sim_player = 2 if sim_player == 1 else 1

        # 4. BACKPROPAGATION — update wins/visits up the tree
        result = sim_board.check_winner()
        while node is not None:
            node.visits += 1
            if result == ai_player:
                node.wins += 1
            elif result is not None:
                node.wins -= 1
            node = node.parent

    return root.most_visited_child().move