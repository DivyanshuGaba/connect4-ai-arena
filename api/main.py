import uuid
from fastapi import FastAPI, HTTPException
from engine.board import Board

app = FastAPI(title="Connect 4 AI Arena")

# Simple in-memory storage — fine for now.
# Every running game lives in this dictionary, keyed by a random ID.
games: dict[str, dict] = {}


def board_to_dict(game: dict) -> dict:
    """Convert a game's internal state into something JSON-friendly."""
    return {
        "game_id": game["game_id"],
        "grid": game["board"].grid,
        "current_player": game["current_player"],
        "winner": game["board"].check_winner(),
        "valid_moves": game["board"].get_valid_moves(),
    }


@app.post("/game/new")
def new_game():
    """Create a brand new game and return its starting state."""
    game_id = str(uuid.uuid4())
    games[game_id] = {
        "game_id": game_id,
        "board": Board(),
        "current_player": 1,
    }
    return board_to_dict(games[game_id])


@app.get("/game/{game_id}/state")
def get_state(game_id: str):
    """Look up the current state of an existing game."""
    game = games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return board_to_dict(game)