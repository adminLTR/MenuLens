from app.extensions import db


class Allergen(db.Model):
    __tablename__ = "allergens"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False)
    anvisa_listed = db.Column(db.Boolean, nullable=False, default=True)

    translations = db.relationship(
        "AllergenTranslation",
        back_populates="allergen",
        cascade="all, delete-orphan",
    )


class AllergenTranslation(db.Model):
    __tablename__ = "allergen_translations"

    allergen_id = db.Column(
        db.Integer,
        db.ForeignKey("allergens.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), primary_key=True)
    label = db.Column(db.String(120), nullable=False)

    allergen = db.relationship("Allergen", back_populates="translations")
    language = db.relationship("Language")


class DishCategory(db.Model):
    __tablename__ = "dish_categories"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    fallback_model_path = db.Column(db.String(255))
    sort_order = db.Column(db.Integer, nullable=False, default=0)

    translations = db.relationship(
        "CategoryTranslation",
        back_populates="category",
        cascade="all, delete-orphan",
    )
    dishes = db.relationship("Dish", back_populates="category")


class CategoryTranslation(db.Model):
    __tablename__ = "category_translations"

    category_id = db.Column(
        db.Integer,
        db.ForeignKey("dish_categories.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), primary_key=True)
    label = db.Column(db.String(80), nullable=False)

    category = db.relationship("DishCategory", back_populates="translations")
    language = db.relationship("Language")


class Ingredient(db.Model):
    __tablename__ = "ingredients"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(64), unique=True, nullable=False)
    part_model_path = db.Column(db.String(255))

    translations = db.relationship(
        "IngredientTranslation",
        back_populates="ingredient",
        cascade="all, delete-orphan",
    )


class IngredientTranslation(db.Model):
    __tablename__ = "ingredient_translations"

    ingredient_id = db.Column(
        db.Integer,
        db.ForeignKey("ingredients.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), primary_key=True)
    name = db.Column(db.String(120), nullable=False)

    ingredient = db.relationship("Ingredient", back_populates="translations")
    language = db.relationship("Language")


class Menu(db.Model):
    __tablename__ = "menus"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(32), unique=True, nullable=False)
    source_language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), nullable=False)
    is_study_ready = db.Column(db.Boolean, nullable=False, default=False)

    source_language = db.relationship("Language")
    translations = db.relationship(
        "MenuTranslation",
        back_populates="menu",
        cascade="all, delete-orphan",
    )
    dishes = db.relationship("Dish", back_populates="menu")


class MenuTranslation(db.Model):
    __tablename__ = "menu_translations"

    menu_id = db.Column(
        db.Integer,
        db.ForeignKey("menus.id", ondelete="CASCADE"),
        primary_key=True,
    )
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), primary_key=True)
    title = db.Column(db.String(160), nullable=False)

    menu = db.relationship("Menu", back_populates="translations")
    language = db.relationship("Language")
