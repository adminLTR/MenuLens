from flask import Flask
from werkzeug.exceptions import HTTPException

from .response import error


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(HTTPException)
    def handle_http_exception(exc: HTTPException):
        return error(exc.description, exc.code)

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc: Exception):
        app.logger.exception(exc)
        return error("Internal server error", 500)
