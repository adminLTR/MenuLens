from sqlalchemy import text

from app.extensions import db


class HealthService:
    @staticmethod
    def check():
        payload = {
            "status": "ok",
            "service": "menulens-api",
        }
        try:
            db.session.execute(text("SELECT 1"))
            payload["database"] = "ok"
        except Exception:
            payload["status"] = "degraded"
            payload["database"] = "error"
        return payload
