import os

from flask import Flask
from flask_cors import CORS

from config import config_by_name

from .controllers import register_controllers
from .extensions import db, migrate
from .views.errors import register_error_handlers


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)
    config_name = config_name or os.getenv("APP_ENV", "development")
    app.config.from_object(config_by_name[config_name])

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, origins=app.config["CORS_ORIGINS"])

    from . import models  # noqa: F401  registers models for migrations

    register_controllers(app)
    register_error_handlers(app)

    return app
