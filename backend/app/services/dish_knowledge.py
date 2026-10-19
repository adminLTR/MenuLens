import json
import logging
import re

from sqlalchemy.orm import joinedload
from sqlalchemy.orm.attributes import flag_modified

from app.extensions import db
from app.models.catalog import (
    Allergen,
    AllergenTranslation,
    CategoryTranslation,
    DishCategory,
    Ingredient,
    IngredientTranslation,
    Menu,
    MenuTranslation,
)
from app.models.dish import Dish, DishAllergen, DishIngredient, DishNutrition, DishTranslation
from app.models.i18n import Language
from app.services.chroma_dish import (
    find_similar,
    normalize_dish_name,
    remember_alias,
    upsert_dish_name,
)
from app.services.gemini_dish import enrich_dish
from app.services.ocr_engine import clean_dish_name

logger = logging.getLogger(__name__)

KNOWLEDGE_MENU_CODE = "knowledge"
SCAN_CATEGORY_CODE = "scanned"
LANG_CODE = "es"
DEFAULT_PORTION_G = 300.0
SPICE_SCORES = {
    "ninguno": 1,
    "nulo": 1,
    "none": 1,
    "bajo": 2,
    "low": 2,
    "medio": 3,
    "medium": 3,
    "alto": 5,
    "high": 5,
}


def resolve_nutrition(ocr_text: str) -> tuple[dict | None, str | None]:
    text = clean_dish_name(ocr_text)
    if not text:
        return None, None

    cached = _lookup_cached(text)
    if cached:
        return dish_to_nutrition(cached), "mysql"

    nutrition = enrich_dish(text)
    if not nutrition:
        return None, None

    dish = _persist(nutrition, ocr_text=text)
    return (dish_to_nutrition(dish) if dish else nutrition), "gemini"


def dish_to_nutrition(dish: Dish) -> dict:
    row = dish.nutrition
    meta = _parse_notes(row.notes if row else None)
    return {
        "name": _display_name(dish),
        "calories": _as_int(row.energy_kcal if row else None),
        "carbohydrates": _as_int(row.carbs_g if row else None),
        "fats": _as_int(row.fat_g if row else None),
        "proteins": _as_int(row.protein_g if row else None),
        "fiber": _as_int(row.fiber_g if row else None),
        "associated_allergies": _labels(dish.allergens, "allergen", dish.source_language_id),
        "flavor": meta.get("flavor"),
        "spice_level": meta.get("spice_level"),
        "basic_ingredients": _ingredient_labels(dish),
    }


def _lookup_cached(ocr_text: str) -> Dish | None:
    target = normalize_dish_name(ocr_text)
    for dish in _active_dishes():
        if any(normalize_dish_name(name) == target for name in _dish_names(dish)):
            _remember(dish, ocr_text)
            return dish

    hit = find_similar(ocr_text)
    if not hit:
        return None

    dish = db.session.get(Dish, hit["dish_id"])
    if not dish or not dish.is_active:
        logger.warning("Chroma apuntó a dish_id=%s inexistente", hit.get("dish_id"))
        return None

    _remember(dish, ocr_text)
    logger.info(
        "Chroma match ocr='%s' name='%s' distance=%s score=%s",
        ocr_text,
        dish.source_name,
        hit.get("distance"),
        hit.get("score"),
    )
    return dish


def _persist(nutrition: dict, ocr_text: str) -> Dish | None:
    name = clean_dish_name(nutrition.get("name") or "")
    if not name:
        return None

    existing = _find_by_normalized(normalize_dish_name(name))
    if existing:
        _remember(existing, ocr_text)
        return existing

    try:
        language, menu, category = _catalog()
        sweet, salty, spicy = _tastes(nutrition.get("flavor"), nutrition.get("spice_level"))
        dish = Dish(
            menu_id=menu.id,
            category_id=category.id,
            source_language_id=language.id,
            source_name=name[:180],
            image_path="images/scanned.jpg",
            taste_sweet=sweet,
            taste_salty=salty,
            taste_spicy=spicy,
            review_source="gemini",
            ocr_aliases=[],
            is_active=True,
        )
        db.session.add(dish)
        db.session.flush()
        dish.translations.append(
            DishTranslation(
                language_id=language.id,
                name=name[:180],
                short_description=(nutrition.get("flavor") or name)[:255],
            )
        )
        dish.nutrition = DishNutrition(
            portion_g=DEFAULT_PORTION_G,
            energy_kcal=float(nutrition.get("calories") or 0),
            fat_g=float(nutrition.get("fats") or 0),
            carbs_g=_as_float(nutrition.get("carbohydrates")),
            protein_g=_as_float(nutrition.get("proteins")),
            fiber_g=_as_float(nutrition.get("fiber")),
            source="gemini",
            is_estimate=True,
            notes=json.dumps(
                {
                    "flavor": nutrition.get("flavor"),
                    "spice_level": nutrition.get("spice_level"),
                },
                ensure_ascii=False,
            ),
        )
        _set_allergens(dish, language, nutrition.get("associated_allergies") or [])
        _set_ingredients(dish, language, nutrition.get("basic_ingredients") or [])
        _store_alias(dish, ocr_text)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logger.exception("No se pudo guardar el plato en MySQL")
        return None

    upsert_dish_name(dish.id, dish.source_name, kind="canonical")
    remember_alias(dish.id, ocr_text, dish.source_name)
    return dish


def _remember(dish: Dish, ocr_text: str) -> None:
    if _store_alias(dish, ocr_text):
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            logger.exception("No se pudo guardar el alias OCR")
    remember_alias(dish.id, ocr_text, dish.source_name)


def _store_alias(dish: Dish, ocr_text: str) -> bool:
    alias = clean_dish_name(ocr_text)
    if not alias or normalize_dish_name(alias) == normalize_dish_name(dish.source_name):
        return False
    aliases = list(dish.ocr_aliases or [])
    if any(normalize_dish_name(item) == normalize_dish_name(alias) for item in aliases):
        return False
    aliases.append(alias[:180])
    dish.ocr_aliases = aliases
    flag_modified(dish, "ocr_aliases")
    return True


def _catalog():
    language = Language.query.filter_by(code=LANG_CODE).first()
    if language is None:
        language = Language(code=LANG_CODE, name_native="Español", is_rtl=False, is_ui_enabled=True)
        db.session.add(language)
        db.session.flush()

    category = DishCategory.query.filter_by(code=SCAN_CATEGORY_CODE).first()
    if category is None:
        category = DishCategory(code=SCAN_CATEGORY_CODE, sort_order=99)
        db.session.add(category)
        db.session.flush()
        db.session.add(
            CategoryTranslation(
                category_id=category.id,
                language_id=language.id,
                label="Escaneados",
            )
        )

    menu = Menu.query.filter_by(code=KNOWLEDGE_MENU_CODE).first()
    if menu is None:
        menu = Menu(
            code=KNOWLEDGE_MENU_CODE,
            source_language_id=language.id,
            is_study_ready=False,
        )
        db.session.add(menu)
        db.session.flush()
        db.session.add(
            MenuTranslation(
                menu_id=menu.id,
                language_id=language.id,
                title="Conocimiento de platos",
            )
        )

    return language, menu, category


def _set_allergens(dish: Dish, language: Language, labels: list[str]) -> None:
    seen = set()
    for label in labels:
        code = _code(label, 40)
        if not code or code in seen:
            continue
        seen.add(code)
        allergen = Allergen.query.filter_by(code=code).first()
        if allergen is None:
            allergen = Allergen(code=code, anvisa_listed=False)
            db.session.add(allergen)
            db.session.flush()
            db.session.add(
                AllergenTranslation(
                    allergen_id=allergen.id,
                    language_id=language.id,
                    label=label[:120],
                )
            )
        dish.allergens.append(DishAllergen(allergen=allergen, presence="contains"))


def _set_ingredients(dish: Dish, language: Language, labels: list[str]) -> None:
    seen = set()
    for index, label in enumerate(labels):
        code = _code(label, 64)
        if not code or code in seen:
            continue
        seen.add(code)
        ingredient = Ingredient.query.filter_by(code=code).first()
        if ingredient is None:
            ingredient = Ingredient(code=code)
            db.session.add(ingredient)
            db.session.flush()
            db.session.add(
                IngredientTranslation(
                    ingredient_id=ingredient.id,
                    language_id=language.id,
                    name=label[:120],
                )
            )
        dish.ingredients.append(
            DishIngredient(ingredient=ingredient, sort_order=index, is_highlight=index < 3)
        )


def _active_dishes() -> list[Dish]:
    return (
        Dish.query.filter(Dish.is_active.is_(True))
        .options(
            joinedload(Dish.nutrition),
            joinedload(Dish.translations),
            joinedload(Dish.allergens).joinedload(DishAllergen.allergen).joinedload(Allergen.translations),
            joinedload(Dish.ingredients).joinedload(DishIngredient.ingredient).joinedload(
                Ingredient.translations
            ),
        )
        .all()
    )


def _find_by_normalized(target: str) -> Dish | None:
    if not target:
        return None
    for dish in _active_dishes():
        if normalize_dish_name(dish.source_name) == target:
            return dish
    return None


def _dish_names(dish: Dish) -> list[str]:
    names = [dish.source_name]
    aliases = dish.ocr_aliases or []
    if isinstance(aliases, list):
        names.extend(str(alias) for alias in aliases if alias)
    names.extend(item.name for item in dish.translations if item.name)
    return names


def _display_name(dish: Dish) -> str:
    for item in dish.translations:
        if item.name:
            return item.name
    return dish.source_name


def _labels(links, rel_name: str, language_id: int) -> list[str]:
    out = []
    for link in links:
        related = getattr(link, rel_name, None)
        if related is None:
            continue
        chosen = None
        for translation in related.translations:
            chosen = translation.label if hasattr(translation, "label") else translation.name
            if translation.language_id == language_id:
                break
        out.append(chosen or related.code)
    return out


def _ingredient_labels(dish: Dish) -> list[str]:
    items = sorted(dish.ingredients, key=lambda link: link.sort_order)
    labels = []
    for link in items:
        chosen = None
        for translation in link.ingredient.translations:
            chosen = translation.name
            if translation.language_id == dish.source_language_id:
                break
        labels.append(chosen or link.ingredient.code)
    return labels


def _tastes(flavor, spice_level) -> tuple[int, int, int]:
    spicy = SPICE_SCORES.get(str(spice_level or "").casefold(), 2)
    text = str(flavor or "").casefold()
    if "dulce" in text:
        return 4, 1, spicy
    if "salado" in text:
        return 1, 4, spicy
    if "amargo" in text:
        return 1, 2, spicy
    return 2, 2, spicy


def _parse_notes(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip().startswith("{"):
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _code(text: str, maxlen: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", normalize_dish_name(text))
    return slug.strip("_")[:maxlen]


def _as_int(value):
    if value is None:
        return None
    return int(round(float(value)))


def _as_float(value):
    if value is None:
        return None
    return float(value)
