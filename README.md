# MenuLens

Scan a restaurant menu with your phone and understand every dish: translation, description, photo, ingredients, allergens and dietary warnings. Requirements are in [docs/User-Stories-Specification.md](docs/User-Stories-Specification.md).

## Architecture

```
┌────────────────────┐   HTTP/JSON    ┌──────────────────────────┐   SQL   ┌───────────┐
│ Flutter app (MVC)  │ ─────────────► │ Flask API (MVC)          │ ──────► │ MySQL 8.4 │
│ mobile/            │   /api/v1/*    │ backend/  (gunicorn)     │         │ volume    │
└────────────────────┘                │ cloud services: OCR,     │         └───────────┘
                                      │ translation, dish info…  │
                                      └──────────────────────────┘
                 └──────────────── docker compose ─────────────────┘
```

| Service        | Image / build                 | Port | Purpose                                  |
| -------------- | ----------------------------- | ---- | ---------------------------------------- |
| `db`           | `mysql:8.4`                   | 3306 | Persistent database (`db_data` volume)   |
| `backend`      | `./backend/Dockerfile`        | 5000 | REST API, runs migrations on start       |
| `adminer`      | `adminer` (dev only)          | 8080 | Database web UI                          |
| `mobile-build` | `cirruslabs/flutter` (opt-in) | —    | Builds the Android APK without local SDK |

### Backend (`backend/`) — Flask MVC

```
backend/
├── app/
│   ├── __init__.py        # create_app() factory: config, extensions, blueprints, errors
│   ├── extensions.py      # SQLAlchemy, Flask-Migrate
│   ├── models/            # M — SQLAlchemy entities (User, MenuScan, Dish, DiaryEntry)
│   ├── views/             # V — JSON responses and error envelopes
│   ├── controllers/       # C — Blueprints under /api/v1, thin HTTP layer
│   └── services/          # Business logic and cloud integrations (OCR, translation, AI…)
├── tests/                 # pytest (SQLite in-memory)
├── config.py              # Development / Production / Testing configs from env vars
├── wsgi.py                # Entry point for gunicorn / flask CLI
├── entrypoint.sh          # Applies migrations, then starts the server
└── Dockerfile
```

Request flow: `controller` receives the request → calls a `service` → the service uses `models` / external APIs → the controller returns through a `view`.
All responses share one envelope: `{"success": true, "data": ...}` or `{"success": false, "error": {"message": ...}}`.

### Mobile (`mobile/`) — Flutter MVC

```
mobile/lib/
├── main.dart / app.dart   # Bootstrap, MaterialApp, theme, routes
├── core/
│   ├── config/            # AppConfig (API_BASE_URL via --dart-define)
│   ├── network/           # ApiClient (unwraps the API envelope), ApiException
│   ├── routes/            # Named routes
│   └── theme/
├── models/                # M — Plain Dart data classes with fromJson
├── views/                 # V — Widgets/screens, one folder per screen
├── controllers/           # C — ChangeNotifier per screen, holds state and calls services
└── services/              # API access per domain (HealthService, later ScanService…)
```

Views listen to their controller with `ListenableBuilder`; controllers never import widgets, and services never hold UI state.

### Data model (initial)

- `users`: email, password hash, preferred language, diets (JSON), allergies (JSON) — US-06
- `menu_scans`: user, image URL, source language, OCR raw text, status — US-01/02
- `dishes`: scan, original/translated name, description, photo, bounding box, ingredients, allergens, nutrition — US-03/04/05
- `diary_entries`: user, dish, 1–5 rating, note — US-07

## Getting started

```bash
cp .env.example .env            # adjust passwords
docker compose up -d --build    # db + backend (dev mode, hot reload) + adminer
```

Create the first migration (only once, after models change use `migrate` + `upgrade` again):

```bash
docker compose exec backend flask db init
docker compose exec backend flask db migrate -m "initial schema"
docker compose exec backend flask db upgrade
```

Check: <http://localhost:5000/api/v1/health> → `{"success": true, "data": {"service": "menulens-api", "database": "up"}}`

Production-like run (gunicorn, no bind mount, no adminer):

```bash
docker compose -f docker-compose.yml up -d --build
```

### Mobile app

```bash
cd mobile
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:5000/api/v1   # Android emulator
```

Or build the APK inside Docker (output in `mobile/build/app/outputs/flutter-apk/`):

```bash
docker compose --profile mobile run --rm mobile-build
```

### Tests

```bash
docker compose exec backend pytest
cd mobile && flutter test
```
