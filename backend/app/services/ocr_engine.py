import logging
import os
from io import BytesIO

from flask import current_app
from PIL import Image, ImageChops, ImageOps, ImageStat, UnidentifiedImageError

from app.services.menu_parser import OcrLine, OcrWord, extract_dish_lines, _clean_line_text

logger = logging.getLogger(__name__)

MAX_SIDE = 2200
MIN_SIDE = 1400
MIN_WORD_CONF = 25


class OcrUnavailableError(RuntimeError):
    pass


def load_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(data))
        image = ImageOps.exif_transpose(image)
        image = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("invalid_image") from exc
    return _scale_image(image)


def _config(key: str, default: str = "") -> str:
    try:
        value = current_app.config.get(key)
        if value:
            return str(value)
    except RuntimeError:
        pass
    return os.getenv(key, default)


def read_lines(image: Image.Image, crop: bool = False) -> tuple[list[OcrLine], str]:
    engine = (_config("OCR_ENGINE", "tesseract") or "tesseract").lower()
    langs = _config("OCR_LANGS", "por+eng+spa") or "por+eng+spa"
    if crop:
        return _read_tesseract_crop(image, langs), "tesseract-crop"
    if engine == "easyocr":
        try:
            return _read_easyocr(image, langs), "easyocr"
        except Exception as exc:
            logger.warning("EasyOCR falhou, a usar Tesseract: %s", exc)
    return _read_tesseract(image, langs), "tesseract"


def _scale_image(image: Image.Image) -> Image.Image:
    width, height = image.size
    longest = max(width, height)
    if longest < MIN_SIDE:
        scale = MIN_SIDE / longest
    elif longest > MAX_SIDE:
        scale = MAX_SIDE / longest
    else:
        return image
    return image.resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.Resampling.LANCZOS,
    )


def _tesseract_cmd():
    import pytesseract

    cmd = _config("TESSERACT_CMD")
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    elif os.name == "nt":
        default = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(default):
            pytesseract.pytesseract.tesseract_cmd = default
    return pytesseract


def _read_tesseract_crop(image: Image.Image, langs: str) -> list[OcrLine]:
    try:
        pytesseract = _tesseract_cmd()
    except ImportError as exc:
        raise OcrUnavailableError("ocr_unavailable") from exc

    lang = _resolve_langs(pytesseract, langs)
    prepared = _prepare_variants(image)[0]
    words: list[OcrWord] = []
    for psm in (7, 6):
        words.extend(_tesseract_words(pytesseract, prepared, image.size, lang, psm))
        if words:
            break
    lines = extract_dish_lines(_dedupe_words(words))
    if lines:
        if len(lines) > 1:
            lines = [max(lines, key=lambda line: (len(line.text), line.confidence))]
        return lines
    try:
        raw = pytesseract.image_to_string(prepared, lang=lang, config="--oem 3 --psm 7")
    except pytesseract.TesseractError:
        raw = ""
    text = _clean_line_text(raw or "")
    if not text:
        return []
    return [
        OcrLine(text=text, x=0.04, y=0.2, w=0.92, h=0.55, confidence=0.45),
    ]


def _read_tesseract(image: Image.Image, langs: str) -> list[OcrLine]:
    try:
        pytesseract = _tesseract_cmd()
    except ImportError as exc:
        raise OcrUnavailableError("ocr_unavailable") from exc

    lang = _resolve_langs(pytesseract, langs)
    words: list[OcrWord] = []
    for prepared in _prepare_variants(image):
        for psm in (6, 11):
            words.extend(_tesseract_words(pytesseract, prepared, image.size, lang, psm))
    return extract_dish_lines(_dedupe_words(words))


def _resolve_langs(pytesseract, requested: str) -> str:
    try:
        available = set(pytesseract.get_languages(config=""))
    except Exception:
        available = {"eng"}
    parts = [part.strip() for part in requested.replace(",", "+").split("+") if part.strip()]
    ok = [part for part in parts if part in available]
    return "+".join(ok) if ok else "eng"


def _prepare_variants(image: Image.Image) -> list[Image.Image]:
    rgb = image.convert("RGB")
    gray = ImageOps.autocontrast(rgb.convert("L"), cutoff=1)
    mean = ImageStat.Stat(gray).mean[0]
    if mean >= 125:
        return [gray]

    red, green, blue = rgb.split()
    bright = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    bright = ImageOps.autocontrast(bright, cutoff=2)
    mask = bright.point(lambda pixel: 255 if pixel > 130 else 0)
    return [ImageOps.invert(mask), ImageOps.invert(gray)]


def _tesseract_words(pytesseract, prepared, original_size, lang: str, psm: int) -> list[OcrWord]:
    width, height = original_size
    try:
        data = pytesseract.image_to_data(
            prepared,
            lang=lang,
            config=f"--oem 3 --psm {psm}",
            output_type=pytesseract.Output.DICT,
        )
    except pytesseract.TesseractNotFoundError as exc:
        raise OcrUnavailableError("ocr_unavailable") from exc
    except pytesseract.TesseractError as exc:
        logger.warning("Tesseract psm %s falhou: %s", psm, exc)
        return []

    scale_x = width / prepared.size[0]
    scale_y = height / prepared.size[1]
    words = []
    for i, raw in enumerate(data["text"]):
        text = (raw or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if not text or conf < MIN_WORD_CONF:
            continue
        left = int(data["left"][i]) * scale_x
        top = int(data["top"][i]) * scale_y
        box_w = int(data["width"][i]) * scale_x
        box_h = int(data["height"][i]) * scale_y
        words.append(
            OcrWord(
                text=text,
                x=_clamp(left / width),
                y=_clamp(top / height),
                w=_clamp(box_w / width),
                h=_clamp(box_h / height),
                conf=_clamp(conf / 100),
            )
        )
    return words


def _dedupe_words(words: list[OcrWord]) -> list[OcrWord]:
    unique: list[OcrWord] = []
    for word in sorted(words, key=lambda item: item.conf, reverse=True):
        duplicate = False
        for existing in unique:
            if _word_iou(word, existing) < 0.45:
                continue
            duplicate = True
            break
        if not duplicate:
            unique.append(word)
    return unique


def _word_iou(a: OcrWord, b: OcrWord) -> float:
    left = max(a.x, b.x)
    top = max(a.y, b.y)
    right = min(a.x2, b.x2)
    bottom = min(a.y2, b.y2)
    inter = max(0.0, right - left) * max(0.0, bottom - top)
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union else 0.0


def _read_easyocr(image: Image.Image, langs: str) -> list[OcrLine]:
    import numpy as np

    reader = _easyocr_reader(langs)
    raw_items = reader.readtext(np.array(image))
    width, height = image.size
    words = []
    for box, text, conf in raw_items:
        cleaned = (text or "").strip()
        if not cleaned:
            continue
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        words.append(
            OcrWord(
                text=cleaned,
                x=_clamp(x0 / width),
                y=_clamp(y0 / height),
                w=_clamp((x1 - x0) / width),
                h=_clamp((y1 - y0) / height),
                conf=_clamp(float(conf)),
            )
        )
    return extract_dish_lines(words)


_easyocr_instance = None


def _easyocr_reader(langs: str):
    global _easyocr_instance
    if _easyocr_instance is not None:
        return _easyocr_instance

    import easyocr

    mapped = []
    for part in langs.replace(",", "+").split("+"):
        mapped.append(
            {
                "por": "pt",
                "eng": "en",
                "spa": "es",
                "jpn": "ja",
            }.get(part.strip(), part.strip())
        )
    mapped = [code for code in mapped if code]
    _easyocr_instance = easyocr.Reader(mapped or ["pt", "en"], gpu=False)
    return _easyocr_instance


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))
