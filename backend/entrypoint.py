import os
import time

from sqlalchemy import create_engine, text


def wait_for_db(uri, attempts=40, delay=2):
    last_error = None
    for i in range(attempts):
        try:
            engine = create_engine(uri)
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            return
        except Exception as exc:
            last_error = exc
            print(f"Aguardando MySQL ({i + 1}/{attempts}): {exc}", flush=True)
            time.sleep(delay)
    raise SystemExit(f"MySQL indisponível: {last_error}")


def create_schema():
    from app import create_app
    from app.extensions import db

    app = create_app()
    with app.app_context():
        db.create_all()
        print("Esquema criado ou já existente.", flush=True)


if __name__ == "__main__":
    database_url = os.environ["DATABASE_URL"]
    wait_for_db(database_url)
    create_schema()
    os.execvp(
        "gunicorn",
        ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "wsgi:app"],
    )
