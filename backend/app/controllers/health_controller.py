from flask import Blueprint

from app.services.health_service import HealthService
from app.views.response import json_error, json_ok

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
@health_bp.get("/api/health")
def health():
    result = HealthService.check()
    if result["database"] != "ok":
        return json_error(result, 503)
    return json_ok(result)
