from sqlalchemy import text

from app.extensions import db
from app.services.chroma_dish import heartbeat as chroma_heartbeat


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
        try:
            payload["chroma"] = "ok" if chroma_heartbeat() else "error"
        except Exception:
            payload["chroma"] = "error"
        return payload
