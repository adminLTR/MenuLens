from app.extensions import db
from app.models.base import TimestampMixin


class UserProfile(db.Model, TimestampMixin):
    __tablename__ = "user_profiles"
    __table_args__ = (
        db.CheckConstraint("age_years IS NULL OR (age_years BETWEEN 16 AND 120)", name="ck_age"),
        db.CheckConstraint("height_cm IS NULL OR (height_cm BETWEEN 80 AND 250)", name="ck_height"),
        db.CheckConstraint("weight_kg IS NULL OR (weight_kg BETWEEN 20 AND 400)", name="ck_weight"),
        db.CheckConstraint("taste_sweet BETWEEN 1 AND 5", name="ck_profile_sweet"),
        db.CheckConstraint("taste_salty BETWEEN 1 AND 5", name="ck_profile_salty"),
        db.CheckConstraint("taste_spicy BETWEEN 1 AND 5", name="ck_profile_spicy"),
        db.CheckConstraint(
            "load_preference IN ('light', 'indifferent', 'hearty')",
            name="ck_load_preference",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    country_id = db.Column(db.Integer, db.ForeignKey("countries.id"))
    ui_language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), nullable=False)
    content_language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), nullable=False)
    age_years = db.Column(db.Integer)
    height_cm = db.Column(db.Integer)
    weight_kg = db.Column(db.Float)
    taste_sweet = db.Column(db.Integer, nullable=False, default=3)
    taste_salty = db.Column(db.Integer, nullable=False, default=3)
    taste_spicy = db.Column(db.Integer, nullable=False, default=3)
    accepts_alcohol = db.Column(db.Boolean, nullable=False, default=True)
    load_preference = db.Column(db.String(16), nullable=False, default="indifferent")

    user = db.relationship("User", back_populates="profile")
    country = db.relationship("Country")
    ui_language = db.relationship("Language", foreign_keys=[ui_language_id])
    content_language = db.relationship("Language", foreign_keys=[content_language_id])
    allergens = db.relationship("UserAllergen", back_populates="profile", cascade="all, delete-orphan")


class UserAllergen(db.Model):
    __tablename__ = "user_allergens"

    profile_id = db.Column(
        db.Integer,
        db.ForeignKey("user_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    allergen_id = db.Column(
        db.Integer,
        db.ForeignKey("allergens.id"),
        primary_key=True,
    )

    profile = db.relationship("UserProfile", back_populates="allergens")
    allergen = db.relationship("Allergen")
