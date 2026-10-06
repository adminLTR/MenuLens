from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class MenuScan(BaseModel):
    __tablename__ = "menu_scans"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    image_url: Mapped[str | None] = mapped_column(String(512))
    source_language: Mapped[str | None] = mapped_column(String(10))
    raw_text: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")

    user = relationship("User", back_populates="scans")
    dishes = relationship("Dish", back_populates="scan", cascade="all, delete-orphan")
