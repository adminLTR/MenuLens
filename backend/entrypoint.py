import os
import subprocess
import time
import urllib.error
import urllib.request

from sqlalchemy import create_engine, text

os.environ.setdefault("FLASK_APP", "wsgi.py")


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


def run_migrations():
    print("A aplicar migrações (flask db upgrade)...", flush=True)
    subprocess.check_call(["flask", "db", "upgrade"])
    print("Migrações em dia.", flush=True)


def wait_for_chroma(attempts=20, delay=2):
    host = os.getenv("CHROMA_HOST", "chroma")
    port = os.getenv("CHROMA_PORT", "8000")
    url = f"http://{host}:{port}/api/v2/heartbeat"
    last_error = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if 200 <= response.status < 300:
                    print("Chroma disponível.", flush=True)
                    return
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            print(f"Aguardando Chroma ({i + 1}/{attempts}): {exc}", flush=True)
            time.sleep(delay)
    print(f"Chroma indisponível, a continuar sem índice vectorial: {last_error}", flush=True)


if __name__ == "__main__":
    database_url = os.environ["DATABASE_URL"]
    wait_for_db(database_url)
    run_migrations()
    wait_for_chroma()
    # Seeders: ainda não. Entram neste ponto quando forem definidos.
    os.execvp(
        "gunicorn",
        [
            "gunicorn",
            "--bind",
            "0.0.0.0:5000",
            "--workers",
            "2",
            "--timeout",
            "120",
            "wsgi:app",
        ],
    )
