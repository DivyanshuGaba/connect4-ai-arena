import uuid
import time
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from games.connect4.state import Connect4State
from games.connect4.heuristics import score_position
from ai.minimax import find_best_move
from db.session import get_session, init_db
from db import repository
from multiplayer.connection_manager import ConnectionManager, GameSession, RECONNECT_WINDOW_SECONDS
from multiplayer import redis_bus


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Connect 4 AI Arena", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


live_games: dict[str, Connect4State] = {}

# Move count per game, tracked alongside live_games so we don't need a DB
# round trip just to number the next move.
live_move_counts: dict[str, int] = {}

# Tracks live human-vs-human games: seats, tokens, WebSocket connections,
# and disconnect/forfeit timers. See multiplayer/connection_manager.py.
manager = ConnectionManager()


class MoveRequest(BaseModel):
    col: int


class NewPvpRequest(BaseModel):
    username: str


class JoinPvpRequest(BaseModel):
    username: str


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


async def _apply_and_persist(game_id: str, state: Connect4State, col: int, player: int) -> Connect4State:
    """Apply a move to the in-memory state, persist it, return the new state."""
    new_state = state.apply(col)
    live_games[game_id] = new_state

    move_number = live_move_counts.get(game_id, 0) + 1
    live_move_counts[game_id] = move_number

    async with get_session() as session:
        await repository.record_move(
            session, game_id, move_number=move_number, player=player,
            column=col, grid_after=new_state.grid,
        )
        result = new_state.result()
        if result is not None:
            await repository.finish_game(session, game_id, winner=result)

    return new_state


@app.post("/game/new")
async def new_game():
    """Create a brand new game: human (player 1) vs AI (player 2)."""
    game_id = str(uuid.uuid4())
    state = Connect4State()
    live_games[game_id] = state
    live_move_counts[game_id] = 0

    async with get_session() as session:
        await repository.create_game(session, game_id, player_one_kind="human", player_two_kind="ai")

    return state_to_dict(game_id, state)


@app.get("/game/{game_id}/state")
def get_state(game_id: str):
    """Get the current state of a game (from the live in-memory cache)."""
    state = live_games.get(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return state_to_dict(game_id, state)


@app.get("/game/{game_id}/moves")
async def get_moves(game_id: str):
    """Full move-by-move history for a game, for replays -- read from the database."""
    async with get_session() as session:
        game = await repository.get_game_with_moves(session, game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return {
        "game_id": game.id,
        "winner": game.winner,
        "created_at": game.created_at.isoformat(),
        "finished_at": game.finished_at.isoformat() if game.finished_at else None,
        "moves": [
            {"move_number": m.move_number, "player": m.player, "column": m.column, "grid_after": m.grid_after}
            for m in game.moves
        ],
    }


@app.get("/games")
async def list_games(limit: int = 20):
    """Recent games, most recent first."""
    async with get_session() as session:
        games = await repository.list_recent_games(session, limit=limit)
    return [
        {
            "game_id": g.id,
            "winner": g.winner,
            "created_at": g.created_at.isoformat(),
            "finished_at": g.finished_at.isoformat() if g.finished_at else None,
        }
        for g in games
    ]


@app.post("/game/{game_id}/move")
async def make_move(game_id: str, move: MoveRequest):
    """
    Human makes a move, then the AI automatically responds.
    Returns the board state after both moves.
    """
    state = live_games.get(game_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Game not found")

    if state.result() is not None:
        raise HTTPException(status_code=400, detail="Game is already over")

    if move.col not in state.legal_moves():
        raise HTTPException(status_code=400, detail="Invalid move")

    # Human move (player 1)
    state = await _apply_and_persist(game_id, state, move.col, player=1)

    if state.result() is not None:
        return state_to_dict(game_id, state)

    # AI responds (player 2) -- CPU-bound, run it off the event loop.
    ai_col = await asyncio.to_thread(ai_move, state, 2, 5)
    state = await _apply_and_persist(game_id, state, ai_col, player=2)

    return {**state_to_dict(game_id, state), "ai_move": ai_col}


@app.websocket("/game/{game_id}/watch")
async def watch_game(websocket: WebSocket, game_id: str):
    """
    Stream an AI vs AI game live over WebSocket.
    Each message contains the move, board state, and time taken.
    """
    await websocket.accept()

    state = live_games.get(game_id)
    if state is None:
        state = Connect4State()
        live_games[game_id] = state
        live_move_counts.setdefault(game_id, 0)
        async with get_session() as session:
            await repository.create_game(session, game_id, player_one_kind="ai", player_two_kind="ai")

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

        state = await _apply_and_persist(game_id, state, col, player=current_player)

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


@app.post("/game/new/pvp")
async def new_pvp_game(req: NewPvpRequest):
    """
    Create a human-vs-human game. Returns a game_id to share with your
    opponent and a secret token proving you own seat 1 -- keep it, you'll
    need it to connect to the WebSocket and to reconnect if you drop.

    `username` claims an identity for Elo/leaderboard purposes -- there's
    no password or login, so this is just "the name you're playing under,"
    not an authenticated account.
    """
    game_id = str(uuid.uuid4())
    state = Connect4State()
    live_games[game_id] = state
    live_move_counts[game_id] = 0

    session = manager.create_session(game_id, state)

    async with get_session() as db:
        await repository.create_game(db, game_id, player_one_kind="human", player_two_kind="human")
        user = await repository.get_or_create_user(db, req.username)

    session.player_ids[1] = user.id
    session.usernames[1] = user.username

    return {"game_id": game_id, "seat": 1, "token": session.tokens[1], "elo": user.elo}


@app.post("/game/{game_id}/join")
async def join_pvp_game(game_id: str, req: JoinPvpRequest):
    """Claim seat 2 of an existing PvP game. Returns a secret token for that seat."""
    session = manager.get_session(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Game not found")

    token = manager.join(session)
    if token is None:
        raise HTTPException(status_code=400, detail="Game already has two players")

    async with get_session() as db:
        user = await repository.get_or_create_user(db, req.username)
        session.player_ids[2] = user.id
        session.usernames[2] = user.username
        await repository.set_game_players(db, game_id, session.player_ids[1], session.player_ids[2])

    return {"game_id": game_id, "seat": 2, "token": token, "elo": user.elo}


@app.get("/leaderboard")
async def leaderboard(limit: int = 20):
    """Top players by Elo rating, highest first."""
    async with get_session() as session:
        users = await repository.get_leaderboard(session, limit=limit)
    return [{"username": u.username, "elo": u.elo} for u in users]


@app.websocket("/game/{game_id}/play")
async def play_pvp_game(websocket: WebSocket, game_id: str, token: str):
    """
    Human vs human, in real time. Connect with ?token=<your seat token>,
    the one you got from /game/new/pvp or /game/{game_id}/join.

    Send moves as {"action": "move", "col": <int>}. If your connection
    drops, you have RECONNECT_WINDOW_SECONDS to reconnect with the same
    token before it counts as a forfeit for your opponent.
    """
    session = manager.get_session(game_id)
    if session is None:
        await websocket.close(code=4404, reason="Game not found")
        return

    seat = session.seat_for_token(token)
    if seat is None:
        await websocket.close(code=4401, reason="Invalid token")
        return

    if session.connections[seat] is not None:
        await websocket.close(code=4409, reason="This seat is already connected elsewhere")
        return

    await manager.connect(session, seat, websocket)


    relay_task = asyncio.create_task(manager.relay_subscription(session, seat))

  
    await websocket.send_json({"event": "sync", "seat": seat, **state_to_dict(game_id, session.state)})

    opponent_seat = session.opponent_seat(seat)
    if session.connections[opponent_seat] is not None:
        await manager.send_to_seat(session, opponent_seat, {"event": "opponent_connected"})

    async def on_forfeit(session: GameSession, forfeiting_seat: int):
        session.finished = True
        winner = session.opponent_seat(forfeiting_seat)
        new_elo = None
        async with get_session() as db:
            await repository.finish_game(db, game_id, winner=winner)
            new_elo = await repository.apply_elo_update(
                db, session.player_ids[1], session.player_ids[2], winner_seat=winner
            )
        end_message = {
            "event": "end",
            "winner": winner,
            "reason": "forfeit",
            "message": "Your opponent didn't reconnect in time -- you win by forfeit.",
        }
        if new_elo is not None:
            end_message["elo"] = {"1": new_elo[0], "2": new_elo[1]}
        # Direct send: the forfeiting seat's socket is already gone, so this
        # only reaches the winner, who is still connected.
        await manager.send_to_seat(session, winner, end_message)
        manager.cleanup(game_id)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("action") != "move":
                continue

            async with session.lock:
                if session.finished:
                    continue
                if session.state.current_player != seat:
                    await websocket.send_json({"event": "error", "message": "Not your turn"})
                    continue

                col = data.get("col")
                if col not in session.state.legal_moves():
                    await websocket.send_json({"event": "error", "message": "Invalid move"})
                    continue

                new_state = await _apply_and_persist(game_id, session.state, col, player=seat)
                session.state = new_state

                await manager.broadcast(session, {
                    "event": "move", "player": seat, "col": col,
                    **state_to_dict(game_id, new_state),
                })

                if new_state.result() is not None:
                    session.finished = True
                    winner = new_state.winner()
                    new_elo = None
                    async with get_session() as db:
                        new_elo = await repository.apply_elo_update(
                            db, session.player_ids[1], session.player_ids[2], winner_seat=winner
                        )
                    end_message = {
                        "event": "end",
                        "winner": winner,
                        "message": f"Player {winner} wins!" if winner else "It's a draw!",
                    }
                    if new_elo is not None:
                        end_message["elo"] = {"1": new_elo[0], "2": new_elo[1]}
                    await manager.broadcast(session, end_message)
                    manager.cleanup(game_id)

    except WebSocketDisconnect:
        if session.finished:
            return
        await manager.send_to_seat(session, opponent_seat, {
            "event": "opponent_disconnected",
            "reconnect_window_seconds": RECONNECT_WINDOW_SECONDS,
        })
        manager.start_forfeit_countdown(session, seat, on_forfeit)
    finally:
        relay_task.cancel()


async def _start_matched_game(ticket_a: dict, ticket_b: dict) -> dict:
    """
    Creates the PvP game + session for a pair the matchmaking queue just
    formed, registers both players for Elo, and returns everything needed
    to tell each side which seat/token is theirs. ticket_a/ticket_b are the
    {"ticket_id", "username"} dicts the queue handed back.
    """
    game_id = str(uuid.uuid4())
    state = Connect4State()
    live_games[game_id] = state
    live_move_counts[game_id] = 0

    session = manager.create_session(game_id, state)
    session.tokens[2] = uuid.uuid4().hex  # create_session only hands out seat 1's token

    async with get_session() as db:
        await repository.create_game(db, game_id, player_one_kind="human", player_two_kind="human")
        user_a = await repository.get_or_create_user(db, ticket_a["username"])
        user_b = await repository.get_or_create_user(db, ticket_b["username"])
        await repository.set_game_players(db, game_id, user_a.id, user_b.id)

    session.player_ids[1], session.usernames[1] = user_a.id, user_a.username
    session.player_ids[2], session.usernames[2] = user_b.id, user_b.username

    return {
        "game_id": game_id,
        "seats": {
            ticket_a["ticket_id"]: {"seat": 1, "token": session.tokens[1], "elo": user_a.elo},
            ticket_b["ticket_id"]: {"seat": 2, "token": session.tokens[2], "elo": user_b.elo},
        },
    }


@app.websocket("/matchmaking/queue")
async def matchmaking_queue(websocket: WebSocket, username: str):
    """
    Join the Redis-backed matchmaking queue. Connect with ?username=<name>.

    If another waiting player is found immediately, both sides are sent a
    `matched` message right away with the game_id/seat/token to connect to
    /game/{game_id}/play with. Otherwise this connection waits -- listening
    for either a match (published by whichever later player pairs with us)
    or the client giving up by disconnecting -- and leaves the queue in
    either case.
    """
    await websocket.accept()
    ticket_id = str(uuid.uuid4())

    try:
        pair = await redis_bus.join_matchmaking_queue(ticket_id, username)

        if pair is not None:
            ticket_a, ticket_b = pair
            mine, theirs = (ticket_a, ticket_b) if ticket_a["ticket_id"] == ticket_id else (ticket_b, ticket_a)

            match = await _start_matched_game(ticket_a, ticket_b)

          
            await redis_bus.publish(
                redis_bus.matchmaking_channel(theirs["ticket_id"]),
                {"event": "matched", "game_id": match["game_id"], **match["seats"][theirs["ticket_id"]]},
            )

            await websocket.send_json({
                "event": "matched", "game_id": match["game_id"], **match["seats"][mine["ticket_id"]],
            })
            await websocket.close()
            return

   
        async with redis_bus.ChannelSubscriber(redis_bus.matchmaking_channel(ticket_id)) as sub:
            listen_iter = sub.listen()

            async def wait_for_match():
                async for message in listen_iter:
                    return message

            match_task = asyncio.create_task(wait_for_match())
            disconnect_task = asyncio.create_task(websocket.receive_text())

            done, pending = await asyncio.wait(
                {match_task, disconnect_task}, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()

            if match_task in done and not match_task.cancelled():
                await websocket.send_json(match_task.result())
                await websocket.close()
            # else: the client disconnected (or sent something unexpected)
            # before being matched -- just fall through to cleanup below.

    except WebSocketDisconnect:
        pass
    finally:
        # Safe even if we were already matched and popped off the queue --
        # removing a ticket that isn't there is a no-op.
        await redis_bus.leave_matchmaking_queue(ticket_id, username)