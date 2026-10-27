import asyncio
import uuid
from typing import Callable, Optional

from fastapi import WebSocket

from multiplayer import redis_bus

RECONNECT_WINDOW_SECONDS = 45


class GameSession:
    def __init__(self, game_id: str, state):
        self.game_id = game_id
        self.state = state  # current Connect4State; kept in sync by api/main.py

        self.tokens: dict[int, Optional[str]] = {1: None, 2: None}
        self.connections: dict[int, Optional[WebSocket]] = {1: None, 2: None}
        self.disconnect_tasks: dict[int, Optional[asyncio.Task]] = {1: None, 2: None}

        # User id (from db/models.py) and display name per seat, set once
        # both players are known (direct PvP join, or matchmaking). None
        # for a seat that isn't a registered user -- an AI, or (for the
        # older /game/new/pvp + /join flow prior to this step) an
        # anonymous player with no username on file. Elo only updates when
        # both seats have a player_id.
        self.player_ids: dict[int, Optional[int]] = {1: None, 2: None}
        self.usernames: dict[int, Optional[str]] = {1: None, 2: None}

        # Serializes move handling so two near-simultaneous messages can't
        # both be applied to the same state at once.
        self.lock = asyncio.Lock()

        self.finished = False

    def seat_for_token(self, token: str) -> Optional[int]:
        for seat, seat_token in self.tokens.items():
            if seat_token == token:
                return seat
        return None

    def opponent_seat(self, seat: int) -> int:
        return 2 if seat == 1 else 1


class ConnectionManager:
    def __init__(self):
        self.sessions: dict[str, GameSession] = {}

    def create_session(self, game_id: str, state) -> GameSession:
        session = GameSession(game_id, state)
        session.tokens[1] = uuid.uuid4().hex
        self.sessions[game_id] = session
        return session

    def get_session(self, game_id: str) -> Optional[GameSession]:
        return self.sessions.get(game_id)

    def join(self, session: GameSession) -> Optional[str]:
        """Assign seat 2's token, if that seat is still open. Returns the token, or None if full."""
        if session.tokens[2] is not None:
            return None
        token = uuid.uuid4().hex
        session.tokens[2] = token
        return token

    async def connect(self, session: GameSession, seat: int, websocket: WebSocket) -> None:
        """
        Accept the socket for this seat. If a forfeit countdown was running
        for this seat (they'd disconnected), cancel it -- they're back.
        """
        await websocket.accept()
        session.connections[seat] = websocket

        task = session.disconnect_tasks[seat]
        if task is not None and not task.done():
            task.cancel()
        session.disconnect_tasks[seat] = None

    def start_forfeit_countdown(
        self, session: GameSession, seat: int, on_forfeit: Callable
    ) -> None:
        """Called when `seat`'s connection drops. Starts the reconnect window."""
        session.connections[seat] = None
        if session.finished:
            return

        async def _countdown():
            try:
                await asyncio.sleep(RECONNECT_WINDOW_SECONDS)
                if not session.finished and session.connections[seat] is None:
                    await on_forfeit(session, seat)
            except asyncio.CancelledError:
                pass  # they reconnected in time

        session.disconnect_tasks[seat] = asyncio.create_task(_countdown())

    async def send_to_seat(self, session: GameSession, seat: int, message: dict) -> None:
        ws = session.connections[seat]
        if ws is not None:
            try:
                await ws.send_json(message)
            except Exception:
                pass  # the disconnect handler in the endpoint will deal with this

    async def broadcast(self, session: GameSession, message: dict) -> None:
        """
        Publish a game event (a move, game-over, opponent connected/
        disconnected) to this game's Redis channel. It is NOT sent directly
        to the two local WebSocket objects here -- every connected seat's
        websocket handler is independently subscribed to the same channel
        (see relay_subscription below) and forwards whatever it receives to
        its own socket. That's what makes broadcast delivery correct even
        if the two seats' connections are being served by different worker
        processes: nothing here assumes "the other player's socket is in my
        memory."
        """
        await redis_bus.publish(redis_bus.game_channel(session.game_id), message)

    async def relay_subscription(self, session: GameSession, seat: int) -> None:
        """
        Runs for the lifetime of one seat's WebSocket connection: subscribes
        to this game's Redis channel and forwards every published message
        to that seat's own socket. Call this as a background task right
        after connect(); cancel it when the connection closes.
        """
        async with redis_bus.ChannelSubscriber(redis_bus.game_channel(session.game_id)) as sub:
            async for message in sub.listen():
                await self.send_to_seat(session, seat, message)

    def cleanup(self, game_id: str) -> None:
        self.sessions.pop(game_id, None)