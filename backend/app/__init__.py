from flask import Flask
from flask_cors import CORS

from config import Config
from app.extensions import db, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    from app import models  # noqa: F401
    from app.controllers.health_controller import health_bp

    app.register_blueprint(health_bp)

    return app
