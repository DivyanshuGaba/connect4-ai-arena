import json
import os
from typing import Any, AsyncIterator, Optional

import redis.asyncio as redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6380")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

MATCHMAKING_QUEUE_KEY = "matchmaking:queue"

_MATCH_SCRIPT = """
redis.call('RPUSH', KEYS[1], ARGV[1])
local len = redis.call('LLEN', KEYS[1])
if len >= 2 then
    local a = redis.call('LPOP', KEYS[1])
    local b = redis.call('LPOP', KEYS[1])
    return {a, b}
end
return false
"""


async def publish(channel: str, message: dict) -> None:
    await redis_client.publish(channel, json.dumps(message))


class ChannelSubscriber:
    """
    Async context manager: subscribes to one Redis Pub/Sub channel and
    yields parsed JSON messages published to it by ANY process.

    Usage:
        async with ChannelSubscriber("game:abc123") as sub:
            async for message in sub.listen():
                ...
    """

    def __init__(self, channel: str):
        self.channel = channel
        self._pubsub = redis_client.pubsub()

    async def __aenter__(self) -> "ChannelSubscriber":
        await self._pubsub.subscribe(self.channel)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self._pubsub.unsubscribe(self.channel)
        await self._pubsub.aclose()

    async def listen(self) -> AsyncIterator[dict]:
        async for raw in self._pubsub.listen():
            if raw["type"] == "message":
                yield json.loads(raw["data"])


def game_channel(game_id: str) -> str:
    return f"game:{game_id}"


def matchmaking_channel(ticket_id: str) -> str:
    return f"matchmaking:{ticket_id}"


async def join_matchmaking_queue(ticket_id: str, username: str) -> Optional[tuple[dict, dict]]:
    """
    Atomically join the FIFO queue. Returns (ticket_a, ticket_b) -- each a
    {"ticket_id", "username"} dict -- if this call completed a pair
    (queue length reached 2). Returns None if this ticket is now waiting
    alone; the caller should then subscribe to
    matchmaking_channel(ticket_id) and wait to be matched by someone
    else's call to this function.
    """
    ticket = {"ticket_id": ticket_id, "username": username}
    result = await redis_client.eval(_MATCH_SCRIPT, 1, MATCHMAKING_QUEUE_KEY, json.dumps(ticket))
    if result:
        return json.loads(result[0]), json.loads(result[1])
    return None


async def leave_matchmaking_queue(ticket_id: str, username: str) -> None:
    """Remove a ticket from the queue, e.g. because that player disconnected while waiting."""
    ticket = {"ticket_id": ticket_id, "username": username}
    await redis_client.lrem(MATCHMAKING_QUEUE_KEY, 0, json.dumps(ticket))