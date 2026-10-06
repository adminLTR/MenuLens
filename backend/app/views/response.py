from typing import Any

from flask import jsonify


def success(data: Any = None, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def error(message: str, status: int = 400, details: Any = None):
    body = {"success": False, "error": {"message": message}}
    if details is not None:
        body["error"]["details"] = details
    return jsonify(body), status
