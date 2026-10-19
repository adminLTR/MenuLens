from flask import current_app
from rapidfuzz import fuzz
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models.dish import Dish
from app.services.gemini_dish import enrich_dish
from app.services.ocr_engine import OcrUnavailableError, clean_dish_name, load_image, read_lines


class MenuScanService:
    @staticmethod
    def scan(image_bytes: bytes, menu_id=None, crop=False):
        image = load_image(image_bytes, crop=crop)
        try:
            lines, engine = read_lines(image, crop=crop)
        except OcrUnavailableError as exc:
            raise ValueError("ocr_unavailable") from exc

        dishes = _load_dishes(menu_id)
        threshold = int(current_app.config.get("OCR_MATCH_THRESHOLD") or 78)
        items = []
        for index, line in enumerate(lines):
            text = clean_dish_name(line.text) if crop else line.text
            if crop and not text:
                continue
            match = _best_match(text, dishes, threshold)
            items.append(
                {
                    "id": f"ocr-{index}",
                    "text": text,
                    "translated_name": match["name"] if match else None,
                    "confidence": round(line.confidence, 3),
                    "bbox": {
                        "x": round(line.x, 4),
                        "y": round(line.y, 4),
                        "w": round(line.w, 4),
                        "h": round(line.h, 4),
                    },
                    "kind": "dish",
                    "match": match,
                }
            )

        ocr_text = "\n".join(item["text"] for item in items if item.get("text")) or None
        nutrition = enrich_dish(ocr_text) if crop and ocr_text else None
        print(
            f"[menus/scan] nutrition={nutrition.get('name') if nutrition else None}",
            flush=True,
        )
        if crop:
            return {
                "engine": engine,
                "menu_id": menu_id,
                "nutrition": nutrition,
            }
        return {
            "engine": engine,
            "menu_id": menu_id,
            "item_count": len(items),
            "dish_name": ocr_text,
            "items": items,
        }


def _load_dishes(menu_id):
    query = db.session.query(Dish).filter(Dish.is_active.is_(True)).options(
        joinedload(Dish.translations),
    )
    if menu_id:
        query = query.filter(Dish.menu_id == menu_id)
    return query.all()


def _best_match(text, dishes, threshold):
    best = None
    best_score = -1
    for dish in dishes:
        score = max((_name_score(text, candidate) for candidate in _dish_names(dish)), default=0)
        if score > best_score:
            best_score = score
            best = dish
    if not best or best_score < threshold:
        return None
    return {
        "dish_id": best.id,
        "menu_id": best.menu_id,
        "source_name": best.source_name,
        "name": _display_name(best),
        "score": int(best_score),
        "low_confidence": best_score < max(threshold + 10, 88),
    }


def _dish_names(dish: Dish):
    names = [dish.source_name]
    aliases = dish.ocr_aliases or []
    if isinstance(aliases, list):
        names.extend(str(alias) for alias in aliases if alias)
    names.extend(translation.name for translation in dish.translations if translation.name)
    return names


def _display_name(dish: Dish):
    for translation in dish.translations:
        if translation.name:
            return translation.name
    return dish.source_name


def _name_score(left: str, right: str) -> float:
    if not left or not right:
        return 0
    return max(
        fuzz.token_set_ratio(left, right),
        fuzz.WRatio(left, right),
    )
