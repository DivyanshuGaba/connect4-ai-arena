from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Game, Move


async def create_game(
    session: AsyncSession,
    game_id: str,
    player_one_kind: str = "human",
    player_two_kind: str = "ai",
) -> Game:
    game = Game(
        id=game_id,
        player_one_kind=player_one_kind,
        player_two_kind=player_two_kind,
    )
    session.add(game)
    await session.commit()
    return game


async def record_move(
    session: AsyncSession,
    game_id: str,
    move_number: int,
    player: int,
    column: int,
    grid_after: list[list[int]],
) -> Move:
    move = Move(
        game_id=game_id,
        move_number=move_number,
        player=player,
        column=column,
        grid_after=grid_after,
    )
    session.add(move)
    await session.commit()
    return move


async def finish_game(session: AsyncSession, game_id: str, winner: Optional[int]) -> None:
    """winner: 1, 2, or 0 for a draw."""
    from datetime import datetime, timezone

    game = await session.get(Game, game_id)
    if game is None:
        return
    game.winner = winner
    game.finished_at = datetime.now(timezone.utc)
    await session.commit()


async def get_game_with_moves(session: AsyncSession, game_id: str) -> Optional[Game]:
    """For replay: a game plus every move, in order."""
    result = await session.execute(
        select(Game).where(Game.id == game_id).options(selectinload(Game.moves))
    )
    return result.scalar_one_or_none()


async def list_recent_games(session: AsyncSession, limit: int = 20) -> list[Game]:
    result = await session.execute(
        select(Game).order_by(Game.created_at.desc()).limit(limit)
    )
    return list(result.scalars().all())