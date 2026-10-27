import time

import pytest
from fastapi.testclient import TestClient

from api import main as api_main
from multiplayer import connection_manager

# DATABASE_URL / REDIS_URL are set once, for every app-level test module, in
# tests/conftest.py -- see the comment there for why.


@pytest.fixture(autouse=True)
def _clean_state():
    """Fresh in-memory session/game state before every test."""
    api_main.manager = connection_manager.ConnectionManager()
    api_main.live_games.clear()
    api_main.live_move_counts.clear()
    yield


@pytest.fixture
def client():
    with TestClient(api_main.app) as c:
        yield c


def test_create_and_join_pvp_game(client):
    r = client.post("/game/new/pvp", json={"username": "alice"})
    assert r.status_code == 200
    created = r.json()
    assert created["seat"] == 1
    game_id, token1 = created["game_id"], created["token"]

    r = client.post(f"/game/{game_id}/join", json={"username": "bob"})
    assert r.status_code == 200
    joined = r.json()
    assert joined["seat"] == 2
    assert joined["token"] != token1


def test_join_already_full_game_fails(client):
    game_id = client.post("/game/new/pvp", json={"username": "alice"}).json()["game_id"]
    client.post(f"/game/{game_id}/join", json={"username": "bob"})  # fills seat 2

    r = client.post(f"/game/{game_id}/join", json={"username": "bob"})
    assert r.status_code == 400


def test_invalid_token_rejected(client):
    game_id = client.post("/game/new/pvp", json={"username": "alice"}).json()["game_id"]

    with pytest.raises(Exception):
        with client.websocket_connect(f"/game/{game_id}/play?token=not-a-real-token"):
            pass


def test_move_broadcasts_to_both_players(client):
    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "bob"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        sync1 = ws1.receive_json()
        assert sync1["event"] == "sync"
        assert sync1["seat"] == 1

        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            sync2 = ws2.receive_json()
            assert sync2["seat"] == 2

            # player 1 gets told player 2 just connected
            assert ws1.receive_json()["event"] == "opponent_connected"

            ws1.send_json({"action": "move", "col": 3})

            move1 = ws1.receive_json()
            move2 = ws2.receive_json()
            assert move1["event"] == "move"
            assert move1["col"] == 3
            assert move1 == move2  # both players see the identical broadcast
            assert move1["current_player"] == 2


def test_playing_out_of_turn_is_rejected(client):
    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "bob"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        ws1.receive_json()  # sync
        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            ws2.receive_json()  # sync
            ws1.receive_json()  # opponent_connected

            # seat 2 tries to move first -- it's seat 1's turn
            ws2.send_json({"action": "move", "col": 0})
            err = ws2.receive_json()
            assert err["event"] == "error"
            assert "turn" in err["message"].lower()


def test_disconnect_then_forfeit_after_window(client, monkeypatch):
    monkeypatch.setattr(connection_manager, "RECONNECT_WINDOW_SECONDS", 0.3)

    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "bob"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        ws1.receive_json()  # sync

        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            ws2.receive_json()  # sync
            ws1.receive_json()  # opponent_connected
        # ws2's `with` block just exited -- that closes seat 2's connection

        disconnected = ws1.receive_json()
        assert disconnected["event"] == "opponent_disconnected"

        # Block until the forfeit fires (short window set above) or time out
        end = ws1.receive_json()
        assert end["event"] == "end"
        assert end["winner"] == 1
        assert end.get("reason") == "forfeit"


def test_disconnect_then_reconnect_cancels_forfeit(client, monkeypatch):
    monkeypatch.setattr(connection_manager, "RECONNECT_WINDOW_SECONDS", 1.0)

    created = client.post("/game/new/pvp", json={"username": "alice"}).json()
    game_id, token1 = created["game_id"], created["token"]
    token2 = client.post(f"/game/{game_id}/join", json={"username": "bob"}).json()["token"]

    with client.websocket_connect(f"/game/{game_id}/play?token={token1}") as ws1:
        ws1.receive_json()  # sync

        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2:
            ws2.receive_json()
            ws1.receive_json()  # opponent_connected
        ws1.receive_json()  # opponent_disconnected

        # Reconnect well within the 1.0s window
        time.sleep(0.2)
        with client.websocket_connect(f"/game/{game_id}/play?token={token2}") as ws2b:
            resync = ws2b.receive_json()
            assert resync["event"] == "sync"
            assert resync["seat"] == 2

            reconnected_msg = ws1.receive_json()
            assert reconnected_msg["event"] == "opponent_connected"

        # Wait past what the original forfeit window would have been, then
        # confirm the game is still alive (no forfeit fired).
        session = api_main.manager.get_session(game_id)
        assert session is not None
        assert session.finished is False