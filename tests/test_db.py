import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from db.models import Base
from db import repository


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as s:
        yield s
    await engine.dispose()


@pytest.mark.asyncio
async def test_create_game(session):
    game = await repository.create_game(session, "g1", player_one_kind="human", player_two_kind="ai")
    assert game.id == "g1"
    assert game.winner is None
    assert game.finished_at is None


@pytest.mark.asyncio
async def test_record_move_and_fetch_history(session):
    await repository.create_game(session, "g1")
    grid = [[0] * 7 for _ in range(6)]
    grid[5][3] = 1
    await repository.record_move(session, "g1", move_number=1, player=1, column=3, grid_after=grid)

    fetched = await repository.get_game_with_moves(session, "g1")
    assert len(fetched.moves) == 1
    assert fetched.moves[0].column == 3
    assert fetched.moves[0].grid_after == grid


@pytest.mark.asyncio
async def test_finish_game_sets_winner_and_timestamp(session):
    await repository.create_game(session, "g1")
    await repository.finish_game(session, "g1", winner=1)

    fetched = await repository.get_game_with_moves(session, "g1")
    assert fetched.winner == 1
    assert fetched.finished_at is not None


@pytest.mark.asyncio
async def test_finish_game_on_unknown_game_does_not_raise(session):
    # Should be a silent no-op, not a crash -- callers shouldn't have to
    # special-case a missing game id.
    await repository.finish_game(session, "does-not-exist", winner=1)


@pytest.mark.asyncio
async def test_list_recent_games_orders_newest_first(session):
    await repository.create_game(session, "g1")
    await repository.create_game(session, "g2")
    await repository.create_game(session, "g3")

    recents = await repository.list_recent_games(session, limit=10)
    ids = [g.id for g in recents]
    assert ids == ["g3", "g2", "g1"]