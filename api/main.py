import uuid
import math
import time
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from engine.board import Board
from ai.minimax import find_best_move

app = FastAPI(title="Connect 4 AI Arena")

games: dict[str, dict] = {}


class MoveRequest(BaseModel):
    col: int


def board_to_dict(game: dict) -> dict:
    return {
        "game_id": game["game_id"],
        "grid": game["board"].grid,
        "current_player": game["current_player"],
        "winner": game["board"].check_winner(),
        "valid_moves": game["board"].get_valid_moves(),
        "is_draw": game["board"].is_draw(),
    }


@app.post("/game/new")
def new_game():
    """Create a brand new game."""
    game_id = str(uuid.uuid4())
    games[game_id] = {
        "game_id": game_id,
        "board": Board(),
        "current_player": 1,
    }
    return board_to_dict(games[game_id])


@app.get("/game/{game_id}/state")
def get_state(game_id: str):
    """Get the current state of a game."""
    game = games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return board_to_dict(game)


@app.post("/game/{game_id}/move")
def make_move(game_id: str, move: MoveRequest):
    """
    Human makes a move, then the AI automatically responds.
    Returns the board state after both moves.
    """
    game = games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    board = game["board"]

    # Check game isn't already over
    if board.check_winner() or board.is_draw():
        raise HTTPException(status_code=400, detail="Game is already over")

    # Validate and apply human move (player 1)
    if move.col not in board.get_valid_moves():
        raise HTTPException(status_code=400, detail="Invalid move")

    board.drop_piece(move.col, 1)

    # Check if human just won
    if board.check_winner() or board.is_draw():
        return board_to_dict(game)

    # AI responds (player 2)
    ai_col = find_best_move(board, ai_player=2, depth=5)
    board.drop_piece(ai_col, 2)

    game["current_player"] = 1  # always human's turn next
    return {**board_to_dict(game), "ai_move": ai_col}

@app.websocket("/game/{game_id}/watch")
async def watch_game(websocket: WebSocket, game_id: str):
    """
    Stream an AI vs AI game live over WebSocket.
    Each message contains the move, board state, eval score, and time taken.
    """
    await websocket.accept()

    board = Board()
    current_player = 1

    await websocket.send_json({
        "event": "start",
        "grid": board.grid,
        "message": "AI vs AI game starting"
    })

    while True:
        valid_moves = board.get_valid_moves()

        if board.check_winner() or not valid_moves:
            winner = board.check_winner()
            await websocket.send_json({
                "event": "end",
                "winner": winner,
                "message": f"Player {winner} wins!" if winner else "It's a draw!"
            })
            break

        # Time how long the AI takes to think
        start = time.time()
        col = find_best_move(board, ai_player=current_player, depth=4)
        elapsed = round(time.time() - start, 3)

        board.drop_piece(col, current_player)

        await websocket.send_json({
            "event": "move",
            "player": current_player,
            "col": col,
            "grid": board.grid,
            "think_time_seconds": elapsed,
            "valid_moves": board.get_valid_moves(),
            "winner": board.check_winner(),
        })

        # Small delay so the frontend can render smoothly
        await asyncio.sleep(0.5)

        current_player = 2 if current_player == 1 else 1

    await websocket.close()