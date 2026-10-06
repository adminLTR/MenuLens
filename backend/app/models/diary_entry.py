from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class DiaryEntry(BaseModel):
    __tablename__ = "diary_entries"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_diary_rating_range"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    dish_id: Mapped[int] = mapped_column(ForeignKey("dishes.id"), index=True)
    rating: Mapped[int | None] = mapped_column(SmallInteger)
    note: Mapped[str | None] = mapped_column(Text)

    user = relationship("User", back_populates="diary_entries")
    dish = relationship("Dish")
