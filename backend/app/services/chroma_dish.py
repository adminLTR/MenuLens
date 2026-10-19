import hashlib
import json
import logging
import math
import unicodedata
import urllib.error
import urllib.request

from flask import current_app
from rapidfuzz import fuzz

from app.services.ocr_engine import clean_dish_name

logger = logging.getLogger(__name__)

_EMBED_DIM = 384
_collection_id = None
_reindexed = False
_TENANT = "default_tenant"
_DATABASE = "default_database"


def normalize_dish_name(text: str) -> str:
    cleaned = clean_dish_name(text).casefold()
    stripped = unicodedata.normalize("NFKD", cleaned)
    return "".join(ch for ch in stripped if not unicodedata.combining(ch)).strip()


def heartbeat() -> bool:
    try:
        _request("GET", "/api/v2/heartbeat")
        return True
    except Exception as exc:
        logger.warning("Chroma no responde: %s", exc)
        return False


def find_similar(ocr_text: str) -> dict | None:
    query = clean_dish_name(ocr_text)
    if not query:
        return None
    try:
        collection_id = _ensure_collection()
        _maybe_reindex(collection_id)
        if _count(collection_id) == 0:
            return None
        result = _request(
            "POST",
            _records_path(collection_id, "query"),
            {
                "query_embeddings": [_embed(query)],
                "n_results": 3,
                "include": ["documents", "metadatas", "distances"],
            },
        )
    except Exception as exc:
        logger.warning("Chroma query falló: %s", exc)
        return None

    ids = (result.get("ids") or [[]])[0]
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]
    max_distance = float(current_app.config.get("CHROMA_MATCH_DISTANCE") or 0.42)
    min_fuzz = int(current_app.config.get("CHROMA_FUZZ_MIN") or 72)

    best = None
    for index, chroma_id in enumerate(ids):
        if not chroma_id:
            continue
        distance = float(distances[index]) if index < len(distances) else 1.0
        if distance > max_distance:
            continue
        metadata = metadatas[index] if index < len(metadatas) else {}
        document = documents[index] if index < len(documents) else ""
        dish_id = _metadata_dish_id(metadata)
        candidate = str((metadata or {}).get("canonical_name") or document or "")
        if not dish_id or not candidate:
            continue
        score = _name_score(query, candidate)
        if score < min_fuzz:
            continue
        if best is None or distance < best["distance"]:
            best = {
                "dish_id": dish_id,
                "name": candidate,
                "distance": round(distance, 4),
                "score": score,
            }
    return best


def upsert_dish_name(dish_id: int, name: str, kind: str = "canonical") -> None:
    text = clean_dish_name(name)
    if dish_id is None or not text:
        return
    _upsert_record(
        dish_id,
        text,
        kind=kind,
        canonical_name=text if kind == "canonical" else text,
    )


def remember_alias(dish_id: int, ocr_text: str, canonical_name: str) -> None:
    alias = clean_dish_name(ocr_text)
    canonical = clean_dish_name(canonical_name)
    if not alias or normalize_dish_name(alias) == normalize_dish_name(canonical):
        return
    _upsert_record(dish_id, alias, kind="alias", canonical_name=canonical)


def reindex(dishes: list) -> int:
    indexed = 0
    for dish in dishes:
        name = getattr(dish, "source_name", None) or getattr(dish, "name", None)
        upsert_dish_name(dish.id, name, kind="canonical")
        for alias in getattr(dish, "ocr_aliases", None) or []:
            remember_alias(dish.id, str(alias), name)
        indexed += 1
    return indexed


def _upsert_record(dish_id: int, text: str, kind: str, canonical_name: str) -> None:
    try:
        collection_id = _ensure_collection()
        _request(
            "POST",
            _records_path(collection_id, "upsert"),
            {
                "ids": [_vector_id(dish_id, text, kind)],
                "embeddings": [_embed(text)],
                "documents": [text],
                "metadatas": [
                    {
                        "dish_id": int(dish_id),
                        "kind": kind,
                        "canonical_name": canonical_name,
                        "name_normalized": normalize_dish_name(text),
                    }
                ],
            },
        )
    except Exception as exc:
        logger.warning("Chroma upsert falló: %s", exc)


def _ensure_collection() -> str:
    global _collection_id
    if _collection_id:
        return _collection_id
    name = current_app.config.get("CHROMA_COLLECTION") or "dish_names"
    payload = _request(
        "POST",
        _collections_path(),
        {
            "name": name,
            "get_or_create": True,
            "configuration": {"hnsw": {"space": "cosine"}},
        },
    )
    collection_id = payload.get("id")
    if not collection_id:
        raise RuntimeError("chroma_collection_id_missing")
    _collection_id = collection_id
    return collection_id


def _maybe_reindex(collection_id: str) -> None:
    global _reindexed
    if _reindexed or _count(collection_id) > 0:
        _reindexed = True
        return
    from app.models.dish import Dish

    dishes = Dish.query.filter(Dish.is_active.is_(True)).all()
    if dishes:
        reindex(dishes)
        logger.info("Chroma reindexó %s platos desde MySQL", len(dishes))
    _reindexed = True


def _count(collection_id: str) -> int:
    result = _request("GET", _records_path(collection_id, "count"))
    if isinstance(result, int):
        return result
    if isinstance(result, dict):
        return int(result.get("count") or 0)
    return int(result or 0)


def _embed(text: str) -> list[float]:
    source = normalize_dish_name(text)
    if not source:
        return [0.0] * _EMBED_DIM
    vector = [0.0] * _EMBED_DIM
    padded = f" {source} "
    grams = [padded[i : i + n] for n in (2, 3, 4) for i in range(len(padded) - n + 1)]
    grams.extend(source.split())
    for gram in grams:
        digest = hashlib.md5(gram.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], "little") % _EMBED_DIM
        sign = 1.0 if digest[2] & 1 else -1.0
        vector[index] += sign
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def _vector_id(dish_id: int, text: str, kind: str) -> str:
    digest = hashlib.sha1(normalize_dish_name(text).encode("utf-8")).hexdigest()[:16]
    if kind == "canonical":
        return f"dish-{dish_id}"
    return f"dish-{dish_id}-{kind}-{digest}"


def _metadata_dish_id(metadata) -> int | None:
    if not isinstance(metadata, dict):
        return None
    raw = metadata.get("dish_id")
    if raw is None:
        raw = metadata.get("known_dish_id")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _name_score(left: str, right: str) -> float:
    if not left or not right:
        return 0
    return max(
        fuzz.token_set_ratio(left, right),
        fuzz.WRatio(left, right),
        fuzz.token_set_ratio(normalize_dish_name(left), normalize_dish_name(right)),
    )


def _collections_path() -> str:
    return f"/api/v2/tenants/{_TENANT}/databases/{_DATABASE}/collections"


def _records_path(collection_id: str, action: str) -> str:
    return f"{_collections_path()}/{collection_id}/{action}"


def _request(method: str, path: str, body=None):
    host = current_app.config.get("CHROMA_HOST") or "chroma"
    port = int(current_app.config.get("CHROMA_PORT") or 8000)
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"http://{host}:{port}{path}",
        data=payload,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"chroma_http_{exc.code}: {detail}") from exc
    if not raw:
        return None
    return json.loads(raw)
