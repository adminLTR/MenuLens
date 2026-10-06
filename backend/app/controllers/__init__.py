from flask import Flask

from .health_controller import health_bp

API_PREFIX = "/api/v1"


def register_controllers(app: Flask) -> None:
    app.register_blueprint(health_bp, url_prefix=API_PREFIX)
