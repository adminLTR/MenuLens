from flask import Flask
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

from config import Config
from app.extensions import db, migrate
from app.views.response import json_error


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app)

    from app import models  # noqa: F401
    from app.controllers.health_controller import health_bp
    from app.controllers.menu_controller import menu_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(menu_bp)

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return json_error(
            {
                "error": "too_large",
                "message": "A fotografia do cardápio é grande demais.",
            },
            413,
        )

    return app
