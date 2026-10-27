import asyncio
import json
import sys
import threading

import requests
import websockets

BASE = "http://127.0.0.1:8000"
WS_BASE = "ws://127.0.0.1:8000"


def print_grid(grid):
    for row in grid:
        print(" | ".join(str(c) for c in row))
    print("-" * (len(grid[0]) * 4))


async def main():
    if len(sys.argv) > 2:
        # Reconnecting with a known game_id + token -- skip create/join
        # entirely, since both seats are already claimed.
        game_id, token = sys.argv[1], sys.argv[2]
        print(f"Reconnecting to game {game_id}...\n")
        seat = None  # server tells us our seat in the "sync" message

    elif len(sys.argv) > 1:
        game_id = sys.argv[1]
        resp = requests.post(f"{BASE}/game/{game_id}/join")
        if resp.status_code != 200:
            print("Couldn't join:", resp.json())
            return
        data = resp.json()
        seat, token = data["seat"], data["token"]
        print(f"You are seat {seat}.")
        print(f"If you get disconnected, reconnect with:")
        print(f"  python3 play_pvp_cli.py {game_id} {token}\n")

    else:
        resp = requests.post(f"{BASE}/game/new/pvp")
        data = resp.json()
        game_id = data["game_id"]
        seat, token = data["seat"], data["token"]
        print(f"\nGame created! Give this to your opponent so they can join:")
        print(f"  python3 play_pvp_cli.py {game_id}\n")
        print(f"You are seat {seat}.")
        print(f"If you get disconnected, reconnect with:")
        print(f"  python3 play_pvp_cli.py {game_id} {token}\n")

    print("Connecting...\n")

    uri = f"{WS_BASE}/game/{game_id}/play?token={token}"
    async with websockets.connect(uri) as ws:

        def input_loop():
            while True:
                try:
                    col = input("Your move (column 0-6): ")
                    asyncio.run_coroutine_threadsafe(
                        ws.send(json.dumps({"action": "move", "col": int(col)})), loop
                    )
                except (ValueError, EOFError):
                    print("Enter a number 0-6.")
                except (RuntimeError, websockets.exceptions.ConnectionClosed):
                    return

        loop = asyncio.get_event_loop()
        input_thread = threading.Thread(target=input_loop, daemon=True)
        input_thread.start()

        while True:
            raw = await ws.recv()
            msg = json.loads(raw)
            event = msg.get("event")

            if event == "sync":
                seat = msg["seat"]
                print(f"Connected as seat {seat}. Current board:")
                print_grid(msg["grid"])
                if msg["current_player"] == seat:
                    print(">>> It's your turn.")

            elif event == "move":
                print(f"\nPlayer {msg['player']} played column {msg['col']}")
                print_grid(msg["grid"])
                if msg.get("current_player") == seat and msg.get("winner") is None and not msg.get("is_draw"):
                    print(">>> It's your turn.")

            elif event == "opponent_connected":
                print("\n[Your opponent connected.]")

            elif event == "opponent_disconnected":
                secs = msg.get("reconnect_window_seconds")
                print(f"\n[Your opponent disconnected. They have {secs}s to reconnect before you win by forfeit.]")

            elif event == "error":
                print(f"\n[Error: {msg['message']}]")

            elif event == "end":
                print(f"\n{msg['message']}")
                break


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDisconnected.")