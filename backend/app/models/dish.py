from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import BaseModel


class Dish(BaseModel):
    __tablename__ = "dishes"

    scan_id: Mapped[int] = mapped_column(ForeignKey("menu_scans.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    translated_name: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(512))
    bounding_box: Mapped[dict | None] = mapped_column(JSON)
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    allergens: Mapped[list] = mapped_column(JSON, default=list)
    nutrition: Mapped[dict | None] = mapped_column(JSON)

    scan = relationship("MenuScan", back_populates="dishes")
