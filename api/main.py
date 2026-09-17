import uuid
import time
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from games.connect4.state import Connect4State
from games.connect4.heuristics import score_position
from ai.minimax import find_best_move

app = FastAPI(title="Connect 4 AI Arena")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

games: dict[str, Connect4State] = {}


class MoveRequest(BaseModel):
    col: int


def ai_move(state: Connect4State, ai_player: int, depth: int) -> int:
    """Minimax move, run off the event loop so it can't block other connections."""
    return find_best_move(state, ai_player, heuristic_fn=score_position, depth=depth)


def state_to_dict(game_id: str, state: Connect4State) -> dict:
    return {
        "game_id": game_id,
        "grid": state.grid,
        "current_player": state.current_player,
        "winner": state.winner(),
        "valid_moves": state.legal_moves(),
        "is_draw": state.is_draw(),
    }


@app.post("/game/new")
def new_game():
    """Create a brand new game."""
    game_id = str(uuid.uuid4())
    games[game_id] = Connect4State()
    return state_to_dict(game_id, games[game_id])


@app.get("/game/{game_id}/state")
def get_state(game_id: str):
    """Get the current state of a game."""
    state = games.get(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return state_to_dict(game_id, state)


@app.post("/game/{game_id}/move")
async def make_move(game_id: str, move: MoveRequest):
    """
    Human makes a move, then the AI automatically responds.
    Returns the board state after both moves.
    """
    state = games.get(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")

    if state.result() is not None:
        raise HTTPException(status_code=400, detail="Game is already over")

    if move.col not in state.legal_moves():
        raise HTTPException(status_code=400, detail="Invalid move")

    # Human move (player 1)
    state = state.apply(move.col)
    games[game_id] = state

    if state.result() is not None:
        return state_to_dict(game_id, state)

    # AI responds (player 2) -- CPU-bound, so run it off the event loop.
    # Without this, one AI "thinking" for 200ms blocks every other
    # concurrent request/connection for that same 200ms.
    ai_col = await asyncio.to_thread(ai_move, state, 2, 5)
    state = state.apply(ai_col)
    games[game_id] = state

    return {**state_to_dict(game_id, state), "ai_move": ai_col}


@app.websocket("/game/{game_id}/watch")
async def watch_game(websocket: WebSocket, game_id: str):
    """
    Stream an AI vs AI game live over WebSocket.
    Each message contains the move, board state, and time taken.

    If `game_id` matches an existing game, that game's current state is
    used as the starting point; otherwise a fresh game is created under
    that id. (Previously this endpoint silently ignored game_id and
    always started a brand new game.)
    """
    await websocket.accept()

    state = games.get(game_id)
    if state is None:
        state = Connect4State()
        games[game_id] = state

    await websocket.send_json({
        "event": "start",
        "grid": state.grid,
        "message": "AI vs AI game starting",
    })

    while state.result() is None:
        current_player = state.current_player

        start = time.time()
        col = await asyncio.to_thread(ai_move, state, current_player, 4)
        elapsed = round(time.time() - start, 3)

        state = state.apply(col)
        games[game_id] = state

        try:
            await websocket.send_json({
                "event": "move",
                "player": current_player,
                "col": col,
                "grid": state.grid,
                "think_time_seconds": elapsed,
                "valid_moves": state.legal_moves(),
                "winner": state.winner(),
            })
        except WebSocketDisconnect:
            return

        await asyncio.sleep(0.5)  # let the frontend render smoothly

    winner = state.winner()
    await websocket.send_json({
        "event": "end",
        "winner": winner,
        "message": f"Player {winner} wins!" if winner else "It's a draw!",
    })
    await websocket.close()
