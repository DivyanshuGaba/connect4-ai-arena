from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    games_as_player_one: Mapped[list["Game"]] = relationship(
        back_populates="player_one", foreign_keys="Game.player_one_id"
    )
    games_as_player_two: Mapped[list["Game"]] = relationship(
        back_populates="player_two", foreign_keys="Game.player_two_id"
    )

    def __repr__(self) -> str:
        return f"User(id={self.id}, username={self.username!r})"


class Game(Base):
    __tablename__ = "games"

    # Text primary key: keeps the same UUID string the API already hands
    # out as game_id, so the REST/WebSocket contract doesn't have to change.
    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    # Nullable: a game can involve an AI or an anonymous player with no
    # User row at all. NULL means "not a registered user in this seat."
    player_one_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    player_two_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # "human" or "ai" -- lets game history show what actually played, since
    # player_two_id being NULL is ambiguous between "AI" and "anonymous human."
    player_one_kind: Mapped[str] = mapped_column(String(10), default="human")
    player_two_kind: Mapped[str] = mapped_column(String(10), default="ai")

    # 1, 2, 0 (draw), or NULL while the game is still in progress
    winner: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    player_one: Mapped["User | None"] = relationship(
        back_populates="games_as_player_one", foreign_keys=[player_one_id]
    )
    player_two: Mapped["User | None"] = relationship(
        back_populates="games_as_player_two", foreign_keys=[player_two_id]
    )
    moves: Mapped[list["Move"]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Move.move_number"
    )

    def __repr__(self) -> str:
        return f"Game(id={self.id}, winner={self.winner})"


class Move(Base):
    __tablename__ = "moves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id"), index=True)

    move_number: Mapped[int] = mapped_column(Integer)  # 1-indexed, in play order
    player: Mapped[int] = mapped_column(Integer)        # 1 or 2, who made this move
    column: Mapped[int] = mapped_column(Integer)         # which column was played

    # Full board state (list of lists) right after this move -- makes
    # replays trivial to reconstruct without re-simulating every move.
    grid_after: Mapped[dict] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    game: Mapped["Game"] = relationship(back_populates="moves")

    def __repr__(self) -> str:
        return f"Move(game_id={self.game_id}, move_number={self.move_number}, column={self.column})"