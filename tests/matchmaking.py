import time
import threading

import pytest
import redis as redis_sync
from fastapi.testclient import TestClient

from api import main as api_main
from multiplayer import connection_manager, redis_bus


_sync_redis = redis_sync.from_url(redis_bus.REDIS_URL, decode_responses=True)


@pytest.fixture(autouse=True)
def _clean_state():
    """Fresh in-memory session/game state, and an empty matchmaking queue, before every test."""
    api_main.manager = connection_manager.ConnectionManager()
    api_main.live_games.clear()
    api_main.live_move_counts.clear()
    _sync_redis.delete(redis_bus.MATCHMAKING_QUEUE_KEY)
    yield


@pytest.fixture
def client():
    with TestClient(api_main.app) as c:
        yield c


def _play_to_vertical_win(ws1, ws2):
    """
    Plays out a full game: seat 1 drops into column 0 four times (a vertical
    four-in-a-row), seat 2 drops into column 1 in between. Returns the final
    "end" message as seen by seat 1 (seat 2 sees the identical broadcast).
    """
    moves = [(1, ws1, 0), (2, ws2, 1), (1, ws1, 0), (2, ws2, 1), (1, ws1, 0), (2, ws2, 1), (1, ws1, 0)]
    end = None
    for player, ws, col in moves:
        ws.send_json({"action": "move", "col": col})
        msg1 = ws1.receive_json()
        msg2 = ws2.receive_json()
        assert msg1 == msg2
        # A move that finishes the game is followed by a SEPARATE "end"
        # broadcast (see api/main.py) -- read that one too when it's coming.
        if msg1["event"] == "move" and msg1["winner"] is not None:
            end = ws1.receive_json()
            assert ws2.receive_json() == end
    return end


def test_leaderboard_starts_empty(client):
    assert client.get("/leaderboard").json() == []


def test_leaderboard_lists_registered_players(client):
    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    client.post(f"/game/{created['game_id']}/join", json={"username": "bob"})

    board = client.get("/leaderboard").json()
    usernames = {row["username"] for row in board}
    assert usernames == {"alice", "bob"}
    assert all(row["elo"] == 1200 for row in board)


def test_elo_updates_when_a_pvp_game_finishes(client):
    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "bob"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        ws1.receive_json()  # sync
        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            ws2.receive_json()  # sync
            ws1.receive_json()  # opponent_connected

            end = _play_to_vertical_win(ws1, ws2)

    assert end["event"] == "end"
    assert end["winner"] == 1
    assert end["elo"]["1"] > 1200  # alice (winner) gained rating
    assert end["elo"]["2"] < 1200  # bob (loser) lost rating

    board = {row["username"]: row["elo"] for row in client.get("/leaderboard").json()}
    assert board["alice"] == end["elo"]["1"]
    assert board["bob"] == end["elo"]["2"]


def test_elo_updates_on_forfeit(client, monkeypatch):
    monkeypatch.setattr(connection_manager, "RECONNECT_WINDOW_SECONDS", 0.3)

    created = client.post("/game/new/pvp", json={"username": "carol"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "dave"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        ws1.receive_json()  # sync
        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            ws2.receive_json()
            ws1.receive_json()  # opponent_connected
        # ws2 disconnects here

        disconnected = ws1.receive_json()
        assert disconnected["event"] == "opponent_disconnected"

        end = ws1.receive_json()
        assert end["event"] == "end"
        assert end["winner"] == 1
        assert end["elo"]["1"] > 1200
        assert end["elo"]["2"] < 1200


def test_vs_ai_games_never_touch_elo(client):
    """A plain single-player game (vs AI) has no second registered user, so finishing it must not call Elo at all."""
    before = client.get("/leaderboard").json()
    created = client.post("/game/new").json()
    game_id = created["game_id"]
    r = client.post(f"/game/{game_id}/move", json={"col": 3})
    assert r.status_code == 200
    # No crash, and no new leaderboard entry -- vs-AI games have no second
    # registered user, so there's nothing for Elo to update.
    assert client.get("/leaderboard").json() == before


def test_matchmaking_pairs_two_waiting_players(client):
    """
    Two players joining the queue (one slightly after the other, on separate
    threads, since TestClient websockets are blocking) should get matched
    with each other and told the same game_id.
    """
    results = {}

    def _connect(name, key):
        with client.websocket_connect(f"/matchmaking/queue?username={name}") as ws:
            results[key] = ws.receive_json()

    t1 = threading.Thread(target=_connect, args=("erin", "erin"))
    t1.start()
    time.sleep(0.2)  # make sure erin is queued and waiting first
    t2 = threading.Thread(target=_connect, args=("frank", "frank"))
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    assert "erin" in results and "frank" in results
    erin_match, frank_match = results["erin"], results["frank"]
    assert erin_match["event"] == "matched"
    assert frank_match["event"] == "matched"
    assert erin_match["game_id"] == frank_match["game_id"]
    assert {erin_match["seat"], frank_match["seat"]} == {1, 2}
    assert erin_match["token"] != frank_match["token"]


def test_matchmaking_leaves_queue_on_disconnect(client):
    """A player who disconnects without being matched shouldn't linger in the queue forever."""
    with client.websocket_connect("/matchmaking/queue?username=grace"):
        pass  # connect and immediately disconnect, before anyone else joins

    queue_len = _sync_redis.llen(redis_bus.MATCHMAKING_QUEUE_KEY)
    assert queue_len == 0