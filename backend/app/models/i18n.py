from app.extensions import db


class Language(db.Model):
    __tablename__ = "languages"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(16), unique=True, nullable=False)
    name_native = db.Column(db.String(80), nullable=False)
    is_rtl = db.Column(db.Boolean, nullable=False, default=False)
    is_ui_enabled = db.Column(db.Boolean, nullable=False, default=True)


class Country(db.Model):
    __tablename__ = "countries"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(2), unique=True, nullable=False)
    name_en = db.Column(db.String(80), nullable=False)


class UiString(db.Model):
    __tablename__ = "ui_strings"
    __table_args__ = (db.UniqueConstraint("language_id", "key", name="uq_ui_string_lang_key"),)

    id = db.Column(db.Integer, primary_key=True)
    language_id = db.Column(db.Integer, db.ForeignKey("languages.id"), nullable=False)
    key = db.Column("key", db.String(120), nullable=False)
    value = db.Column(db.Text, nullable=False)

    language = db.relationship("Language")
