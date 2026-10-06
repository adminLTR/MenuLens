from .response import success


def render_health(status: dict):
    http_status = 200 if status["database"] == "up" else 503
    return success(status, http_status)
