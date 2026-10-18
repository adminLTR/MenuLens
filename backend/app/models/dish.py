from app.extensions import db
from app.models.base import TimestampMixin


class Dish(db.Model, TimestampMixin):
    __tablename__ = "dishes"
    __table_args__ = (
        db.CheckConstraint("taste_sweet BETWEEN 1 AND 5", name="ck_dish_sweet"),
        db.CheckConstraint("taste_salty BETWEEN 1 AND 5", name="ck_dish_salty"),
        db.CheckConstraint("taste_spicy BETWEEN 1 AND 5", name="ck_dish_spicy"),
        db.Index("ix_dishes_menu_id", "menu_id"),
        db.Index("ix_dishes_category_id", "category_id"),
        db.Index("ix_dishes_source_name", "source_name"),
    )

    id = db.Column(db.Integer, primary_key=True)
    menu_id = db.Column(db.Integer, db.ForeignKey("menus.id"), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("dish_categories.id"), nullable=False)
    source_language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), nullable=False)
    source_name = db.Column(db.String(180), nullable=False)
    image_path = db.Column(db.String(255), nullable=False)
    model_path = db.Column(db.String(255))
    model_scale_m = db.Column(db.Float, nullable=False, default=0.22)
    taste_sweet = db.Column(db.Integer, nullable=False)
    taste_salty = db.Column(db.Integer, nullable=False)
    taste_spicy = db.Column(db.Integer, nullable=False)
    contains_alcohol = db.Column(db.Boolean, nullable=False, default=False)
    review_source = db.Column(db.String(255), nullable=False, default="demo")
    ocr_aliases = db.Column(db.JSON)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    menu = db.relationship("Menu", back_populates="dishes")
    category = db.relationship("DishCategory", back_populates="dishes")
    source_language = db.relationship("Language")
    translations = db.relationship(
        "DishTranslation",
        back_populates="dish",
        cascade="all, delete-orphan",
    )
    nutrition = db.relationship(
        "DishNutrition",
        back_populates="dish",
        uselist=False,
        cascade="all, delete-orphan",
    )
    allergens = db.relationship(
        "DishAllergen",
        back_populates="dish",
        cascade="all, delete-orphan",
    )
    ingredients = db.relationship(
        "DishIngredient",
        back_populates="dish",
        cascade="all, delete-orphan",
    )


class DishTranslation(db.Model):
    __tablename__ = "dish_translations"

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), primary_key=True)
    name = db.Column(db.String(180), nullable=False)
    short_description = db.Column(db.String(255), nullable=False)
    review = db.Column(db.Text)

    dish = db.relationship("Dish", back_populates="translations")
    language = db.relationship("Language")


class DishNutrition(db.Model):
    __tablename__ = "dish_nutrition"

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    portion_g = db.Column(db.Float, nullable=False)
    energy_kcal = db.Column(db.Float, nullable=False)
    fat_g = db.Column(db.Float, nullable=False)
    saturated_fat_g = db.Column(db.Float)
    carbs_g = db.Column(db.Float)
    protein_g = db.Column(db.Float)
    sodium_mg = db.Column(db.Float)
    source = db.Column(db.String(80), nullable=False)
    is_estimate = db.Column(db.Boolean, nullable=False, default=True)
    notes = db.Column(db.Text)

    dish = db.relationship("Dish", back_populates="nutrition")


class DishAllergen(db.Model):
    __tablename__ = "dish_allergens"
    __table_args__ = (
        db.CheckConstraint("presence IN ('contains', 'may_contain')", name="ck_allergen_presence"),
    )

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    allergen_id = db.Column(db.Integer, db.ForeignKey("allergens.id"), primary_key=True)
    presence = db.Column(db.String(16), nullable=False, default="contains")

    dish = db.relationship("Dish", back_populates="allergens")
    allergen = db.relationship("Allergen")


class DishIngredient(db.Model):
    __tablename__ = "dish_ingredients"

    dish_id = db.Column(
        db.Integer,
        db.ForeignKey("dishes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ingredient_id = db.Column(db.Integer, db.ForeignKey("ingredients.id"), primary_key=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_highlight = db.Column(db.Boolean, nullable=False, default=False)

    dish = db.relationship("Dish", back_populates="ingredients")
    ingredient = db.relationship("Ingredient")
