import json
import logging
import re
import urllib.error
import urllib.request

from flask import current_app

from app.services.ocr_engine import clean_dish_name

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
MAX_OUTPUT_TOKENS = 280
REQUEST_TIMEOUT = 18

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "name": {"type": "STRING"},
        "calories": {"type": "NUMBER"},
        "carbohydrates": {"type": "NUMBER"},
        "fats": {"type": "NUMBER"},
        "proteins": {"type": "NUMBER"},
        "fiber": {"type": "NUMBER"},
        "associated_allergies": {"type": "ARRAY", "items": {"type": "STRING"}},
        "flavor": {"type": "STRING"},
        "spice_level": {"type": "STRING"},
        "basic_ingredients": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
    "required": [
        "name",
        "calories",
        "carbohydrates",
        "fats",
        "proteins",
        "fiber",
        "associated_allergies",
        "flavor",
        "spice_level",
        "basic_ingredients",
    ],
}


def enrich_dish(ocr_text: str) -> dict | None:
    key = (current_app.config.get("GEMINI_API_KEY") or "").strip()
    text = clean_dish_name(ocr_text)
    if not key or not text:
        return None
    model = (current_app.config.get("GEMINI_MODEL") or DEFAULT_MODEL).strip()
    payload = {
        "contents": [{"role": "user", "parts": [{"text": _prompt(text)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
            "thinkingConfig": {"thinkingLevel": "MINIMAL"},
        },
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        GEMINI_URL.format(model=model),
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        logger.warning("Gemini HTTP %s: %s", exc.code, detail)
        return None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        logger.warning("Gemini no respondió: %s", exc)
        return None

    parsed = _parse_model_json(_extract_text(raw))
    return _normalize(parsed)


def _prompt(ocr_text: str) -> str:
    sample = (
        '{"name":"Causa limeña","calories":350,"carbohydrates":45,"fats":15,'
        '"proteins":10,"fiber":4,"associated_allergies":["pescado","mariscos","huevo"],'
        '"flavor":"salado","spice_level":"medio","basic_ingredients":'
        '["papa amarilla","ají amarillo","limón","pollo o atún","mayonesa","palta"]}'
    )
    return (
        "Estoy en un restaurante pero no leo muy bien el menú. "
        f'El plato dice "{ocr_text}". '
        "Corrige el nombre si el OCR está mal escrito. "
        "Responde un único JSON, claves en inglés, valores en español, "
        "números sin unidades ni texto extra. Formato exacto:\n"
        f"{sample}\n"
        "flavor: salado, dulce, amargo u otro. "
        "spice_level: ninguno, bajo, medio o alto. "
        "associated_allergies y basic_ingredients: arrays cortos. "
        "Sin markdown ni explicaciones."
    )


def _extract_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    return "".join(str(part.get("text") or "") for part in parts)


def _parse_model_json(text: str) -> dict | None:
    raw = (text or "").strip()
    if not raw:
        return None
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


def _normalize(data: dict | None) -> dict | None:
    if not data:
        return None
    name = str(data.get("name") or "").strip()
    if not name:
        return None
    return {
        "name": name,
        "calories": _number(data.get("calories")),
        "carbohydrates": _number(data.get("carbohydrates")),
        "fats": _number(data.get("fats")),
        "proteins": _number(data.get("proteins")),
        "fiber": _number(data.get("fiber")),
        "associated_allergies": _strings(data.get("associated_allergies")),
        "flavor": str(data.get("flavor") or "").strip() or None,
        "spice_level": str(data.get("spice_level") or "").strip() or None,
        "basic_ingredients": _strings(data.get("basic_ingredients")),
    }


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(round(float(value)))
    match = re.search(r"-?\d+(?:[.,]\d+)?", str(value))
    if not match:
        return None
    return int(round(float(match.group(0).replace(",", "."))))


def _strings(value) -> list[str]:
    if isinstance(value, str):
        parts = re.split(r"[,;/]| y ", value)
        return [part.strip() for part in parts if part.strip()]
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]
