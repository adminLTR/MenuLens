from flask import Blueprint

from app.services import health_service
from app.views.health_view import render_health

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    return render_health(health_service.get_status())
