import asyncio
import json
import websockets


async def watch():
    uri = "ws://127.0.0.1:8000/game/test/watch"
    async with websockets.connect(uri) as ws:
        print("Connected — watching AI vs AI game live\n")
        while True:
            try:
                raw = await ws.recv()
                data = json.loads(raw)
                event = data.get("event")

                if event == "start":
                    print("Game started!")

                elif event == "move":
                    print(f"Player {data['player']} → column {data['col']} "
                          f"(thought for {data['think_time_seconds']}s)")
                    for row in data["grid"]:
                        print(" | ".join(str(c) for c in row))
                    print("-" * 29)

                elif event == "end":
                    print(data["message"])
                    break

            except websockets.exceptions.ConnectionClosed:
                break


asyncio.run(watch())