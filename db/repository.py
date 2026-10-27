from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Game, Move, User
from multiplayer import elo


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


async def get_or_create_user(session: AsyncSession, username: str) -> User:
    """
    Looks up a user by username, creating one (at the default Elo) if it
    doesn't exist yet. This app has no passwords or login -- a username is
    just a claimed identity for Elo tracking and the leaderboard, not an
    authenticated account.
    """
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(username=username, elo=elo.DEFAULT_ELO)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user


async def set_game_players(
    session: AsyncSession, game_id: str, player_one_id: Optional[int], player_two_id: Optional[int]
) -> None:
    game = await session.get(Game, game_id)
    if game is None:
        return
    game.player_one_id = player_one_id
    game.player_two_id = player_two_id
    await session.commit()


async def apply_elo_update(
    session: AsyncSession,
    player_one_id: Optional[int],
    player_two_id: Optional[int],
    winner_seat: Optional[int],
) -> Optional[tuple[int, int]]:
    """
    Updates both players' Elo ratings based on the result and writes them
    back. winner_seat: 1, 2, or 0/None for a draw. Returns the
    (new_elo_one, new_elo_two) pair, or None if this wasn't a rated game
    (e.g. one seat was an AI, so has no User row at all -- a vs-AI game
    never touches Elo).
    """
    if player_one_id is None or player_two_id is None:
        return None

    player_one = await session.get(User, player_one_id)
    player_two = await session.get(User, player_two_id)
    if player_one is None or player_two is None:
        return None

    if winner_seat == 1:
        result_for_one = 1.0
    elif winner_seat == 2:
        result_for_one = 0.0
    else:
        result_for_one = 0.5

    new_elo_one, new_elo_two = elo.update_ratings(player_one.elo, player_two.elo, result_for_one)
    player_one.elo = new_elo_one
    player_two.elo = new_elo_two
    await session.commit()
    return new_elo_one, new_elo_two


async def get_leaderboard(session: AsyncSession, limit: int = 20) -> list[User]:
    result = await session.execute(select(User).order_by(User.elo.desc()).limit(limit))
    return list(result.scalars().all())