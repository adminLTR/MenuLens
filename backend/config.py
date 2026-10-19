import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://menulens:menulens@127.0.0.1:3306/menulens?charset=utf8mb4",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(8 * 1024 * 1024)))
    OCR_ENGINE = os.getenv("OCR_ENGINE", "tesseract")
    OCR_LANGS = os.getenv("OCR_LANGS", "por+eng+spa")
    OCR_MATCH_THRESHOLD = int(os.getenv("OCR_MATCH_THRESHOLD", "78"))
    TESSERACT_CMD = os.getenv("TESSERACT_CMD", "")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
