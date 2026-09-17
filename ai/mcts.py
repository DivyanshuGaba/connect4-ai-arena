"""
Monte Carlo Tree Search with UCB1, written against the GameState interface.

Bug fixed vs. the original implementation: win/loss backpropagation used to
be tracked uniformly from a single `ai_player`'s perspective at every node,
regardless of whose turn that node represented. That made UCB1 selection at
opponent-turn nodes implicitly assume the opponent was *also* trying to
maximize the AI's win rate, instead of their own -- i.e. it wasn't really
modeling an adversary. This version follows the standard MCTS convention:
each node's `wins` counter tracks the win rate for `just_moved`, the player
who made the move leading into that node. That's exactly the player whose
decision is being evaluated when the PARENT selects among its children via
UCB1, so selection now correctly alternates "what's good for me" per level.

One consequence of fixing this properly: the algorithm no longer needs an
`ai_player` argument at all. It just finds the best move for whoever's turn
it is in the state you hand it (`state.current_player`) -- which is also
more game-agnostic, since nothing here assumes a fixed AI seat.
"""

import math
import random
from typing import Any, Optional

from games.base import GameState


class MCTSNode:
    def __init__(
        self,
        state: GameState,
        parent: Optional["MCTSNode"] = None,
        move: Optional[Any] = None,
        just_moved: Optional[int] = None,
    ):
        self.state = state
        self.parent = parent
        self.move = move              # move that led to this node
        self.just_moved = just_moved  # player who made that move (None for root)
        self.children: list["MCTSNode"] = []
        self.wins = 0.0                # wins for `just_moved`, from simulations through here
        self.visits = 0
        self.untried_moves = state.legal_moves()

    def is_fully_expanded(self) -> bool:
        return len(self.untried_moves) == 0

    def is_terminal(self) -> bool:
        return self.state.is_terminal()

    def ucb1(self, exploration: float = 1.41) -> float:
        """Balances exploitation (winning nodes) vs exploration (less-visited nodes)."""
        if self.visits == 0:
            return float("inf")
        return (self.wins / self.visits) + exploration * math.sqrt(
            math.log(self.parent.visits) / self.visits
        )

    def best_child(self) -> "MCTSNode":
        return max(self.children, key=lambda c: c.ucb1())

    def most_visited_child(self) -> "MCTSNode":
        """After all simulations, pick the move visited most -- most reliable."""
        return max(self.children, key=lambda c: c.visits)


def mcts_move(state: GameState, iterations: int = 500) -> Any:
    """
    Run MCTS for `iterations` simulations and return the best move for
    whoever's turn it is in `state` (state.current_player).
    """
    root = MCTSNode(state)

    for _ in range(iterations):
        node = root

        # 1. SELECTION -- follow best UCB1 child until we find an unexpanded node
        while node.is_fully_expanded() and not node.is_terminal():
            node = node.best_child()

        # 2. EXPANSION -- add one new child from an untried move
        if not node.is_terminal() and node.untried_moves:
            move = random.choice(node.untried_moves)
            node.untried_moves.remove(move)

            mover = node.state.current_player
            child_state = node.state.apply(move)

            child = MCTSNode(child_state, parent=node, move=move, just_moved=mover)
            node.children.append(child)
            node = child

        # 3. SIMULATION -- play out randomly from this node until the game ends
        sim_state = node.state
        while not sim_state.is_terminal():
            moves = sim_state.legal_moves()
            sim_state = sim_state.apply(random.choice(moves))

        result = sim_state.result()  # 1, 2, or 0 (draw)

        # 4. BACKPROPAGATION -- update wins/visits up the tree
        while node is not None:
            node.visits += 1
            if node.just_moved is not None:
                if result == node.just_moved:
                    node.wins += 1
                elif result == 0:
                    node.wins += 0.5
                # else: the other player won -- no change
            node = node.parent

    return root.most_visited_child().move
