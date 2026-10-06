from sqlalchemy import text

from app.extensions import db


def get_status() -> dict:
    try:
        db.session.execute(text("SELECT 1"))
        database = "up"
    except Exception:
        database = "down"
    return {"service": "menulens-api", "database": database}
