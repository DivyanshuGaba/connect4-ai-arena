import asyncio
import json
import sys
import threading

import websockets

WS_BASE = "ws://127.0.0.1:8000"


def print_grid(grid):
    for row in grid:
        print(" | ".join(str(c) for c in row))
    print("-" * (len(grid[0]) * 4))


async def wait_for_match(username: str):
    uri = f"{WS_BASE}/matchmaking/queue?username={username}"
    print("Joining the matchmaking queue... waiting for an opponent.")
    async with websockets.connect(uri) as ws:
        raw = await ws.recv()
        msg = json.loads(raw)
        if msg.get("event") != "matched":
            print("Unexpected message while waiting:", msg)
            sys.exit(1)
        return msg["game_id"], msg["seat"], msg["token"], msg.get("elo")


async def play(game_id: str, seat: int, token: str):
    uri = f"{WS_BASE}/game/{game_id}/play?token={token}"
    print(f"\nMatched! Connecting to game {game_id} as seat {seat}...\n")

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
                if msg.get("elo"):
                    print(f"New Elo -- seat 1: {msg['elo']['1']}, seat 2: {msg['elo']['2']}")
                break


async def main():
    username = input("Your username: ").strip() or "anonymous"
    game_id, seat, token, elo = await wait_for_match(username)
    if elo is not None:
        print(f"Your Elo: {elo}")
    await play(game_id, seat, token)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDisconnected.")