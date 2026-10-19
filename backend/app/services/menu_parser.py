import re
import unicodedata
from dataclasses import dataclass

from rapidfuzz import fuzz


@dataclass
class OcrWord:
    text: str
    x: float
    y: float
    w: float
    h: float
    conf: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.h


@dataclass
class OcrLine:
    text: str
    x: float
    y: float
    w: float
    h: float
    confidence: float


PRICE_TOKEN = re.compile(
    r"""
    ^
    (?:
        (?:r\s*\$|rs\s*\$?|usd|eur|€|\$)\s*
        \d{1,5}(?:[.,]\d{2})?
      |
        \d{1,4}[.,]\d{2}
    )
    $
    """,
    re.IGNORECASE | re.VERBOSE,
)
PRICE_IN_TEXT = re.compile(
    r"""
    (?:r\s*\$|rs\s*\$?|usd|eur|€|\$)\s*\d{1,5}(?:[.,]\d{2})?
    |
    (?<!\d)\d{1,4}[.,]\d{2}(?!\d)
    """,
    re.IGNORECASE | re.VERBOSE,
)
CURRENCY_ONLY = re.compile(r"^(?:r\s*\$|rs\s*\$?|usd|eur|€|\$)$", re.IGNORECASE)
DOT_LEADER = re.compile(r"[.\u2022·•…\-_]{2,}")
BULLET_TOKEN = re.compile(r"^[\-\*\+•◦‣–—·\u2022]+$")
PHONE_RE = re.compile(r"\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{3,4}")
HANDLE_RE = re.compile(r"^@\w+")
CAMEL_RE = re.compile(r"([a-zà-ú])([A-ZÁ-Ú])")

SECTION_HEADERS = {
    "acompanhamento",
    "acompanhamentos",
    "aperitivos",
    "bebida",
    "bebidas",
    "cardapio",
    "cardapio!",
    "carnes",
    "carta",
    "caseira",
    "combos",
    "comida",
    "comida caseira",
    "domingo",
    "entrada",
    "entradas",
    "especiais",
    "especialidades",
    "extras",
    "lanches",
    "marmita",
    "marmita g",
    "marmita p",
    "massas",
    "menu",
    "menu del dia",
    "peixes",
    "porcao",
    "porcoes",
    "prato do dia",
    "prato principal",
    "pratos",
    "pratos do dia",
    "pratos principais",
    "principal",
    "principais",
    "promocao",
    "quarta",
    "quarta feira",
    "quarta-feira",
    "quinta",
    "quinta feira",
    "quinta-feira",
    "sabado",
    "salada",
    "saladas",
    "salgado",
    "salgados",
    "sanduiche",
    "sanduiches",
    "sandubas",
    "segunda",
    "segunda feira",
    "segunda-feira",
    "sexta",
    "sexta feira",
    "sexta-feira",
    "sobremesa",
    "sobremesas",
    "sopas",
    "sucos",
    "terca",
    "terca feira",
    "terca-feira",
    "tradicional",
    "tradicionais",
}

JUNK_PHRASES = {
    "delivery",
    "take out",
    "takeout",
    "whatsapp",
    "instagram",
    "facebook",
    "entregamos",
    "entrega",
    "siga",
    "peça ja",
    "peca ja",
    "peça já",
    "goomer",
    "contato",
    "telefone",
    "bien peruano",
    "asequible",
    "bien taypa",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "horario",
}

INGREDIENT_HINTS = {
    "arroz",
    "asa de frango",
    "batata frita",
    "farofa",
    "gratinada",
    "molho",
    "molhos",
    "queijo",
    "salame",
    "salames",
    "servido",
    "tilapia",
    "vinagrete",
}

CONNECTORS_END = {"a", "al", "alo", "ao", "c/", "com", "con", "da", "de", "do", "lo", "na", "no"}
WRAP_START = {"a", "al", "alo", "ao", "com", "con", "da", "de", "do", "lo", "na", "no"}
WRAP_WORDS = {
    "caseira",
    "caseiro",
    "completa",
    "completo",
    "empanada",
    "empanado",
    "frita",
    "frito",
    "grelhado",
    "grelhados",
    "manteiga",
    "milanesa",
    "pobre",
}
STANDALONE_DISHES = {
    "agua",
    "arroz",
    "bauru",
    "calabresa",
    "carne",
    "coxinha",
    "farofa",
    "lasanha",
    "misto",
    "palmito",
    "pizza",
    "queijo",
}


def extract_dish_lines(words: list[OcrWord]) -> list[OcrLine]:
    usable = [_clean_word(word) for word in words]
    usable = [word for word in usable if word and _keep_word(word)]
    if not usable:
        return []

    rows = _cluster_rows(usable)
    segments: list[OcrLine] = []
    for row in rows:
        for group in _split_row(row):
            line = _segment_to_line(group)
            if line:
                segments.append(line)

    merged = _merge_wrapped_names(segments)
    finalized = []
    for line in merged:
        text = _finalize_name(line.text)
        if not text:
            continue
        finalized.append(
            OcrLine(text=text, x=line.x, y=line.y, w=line.w, h=line.h, confidence=line.confidence)
        )
    dishes = [line for line in finalized if _is_dish_name(line.text, line.confidence)]
    return _dedupe_dishes(dishes)


def _clean_word(word: OcrWord) -> OcrWord | None:
    text = CAMEL_RE.sub(r"\1 \2", (word.text or "").strip())
    text = DOT_LEADER.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip(" |")
    if not text:
        return None
    return OcrWord(text=text, x=word.x, y=word.y, w=word.w, h=word.h, conf=word.conf)


def _keep_word(word: OcrWord) -> bool:
    if word.w <= 0 or word.h <= 0:
        return False
    if word.conf < 0.22:
        return False
    if word.h < 0.006 and word.conf < 0.6:
        return False
    if BULLET_TOKEN.match(word.text):
        return False
    if len(word.text) <= 2 and word.conf < 0.45 and not word.text.isdigit():
        return False
    letters = sum(ch.isalpha() for ch in word.text)
    if letters == 0 and not _is_price(word.text) and not word.text.isdigit():
        return False
    return True


def _cluster_rows(words: list[OcrWord]) -> list[list[OcrWord]]:
    heights = sorted(word.h for word in words)
    median_h = heights[len(heights) // 2]
    y_tol = max(0.011, median_h * 0.55)
    rows: list[list[OcrWord]] = []
    for word in sorted(words, key=lambda item: (item.y, item.x)):
        placed = False
        for row in rows:
            row_cy = sum(item.cy for item in row) / len(row)
            if abs(word.cy - row_cy) <= y_tol:
                row.append(word)
                placed = True
                break
        if not placed:
            rows.append([word])
    return rows


def _split_row(row: list[OcrWord]) -> list[list[OcrWord]]:
    ordered = sorted(row, key=lambda item: item.x)
    if len(ordered) == 1:
        return [ordered]
    segments = [[ordered[0]]]
    for previous, current in zip(ordered, ordered[1:]):
        gap = current.x - previous.x2
        if gap >= 0.10:
            segments.append([current])
        else:
            segments[-1].append(current)
    return segments


def _segment_to_line(group: list[OcrWord]) -> OcrLine | None:
    ordered = sorted(group, key=lambda item: item.x)
    name_words = []
    seen_price = False
    for word in ordered:
        if _is_price(word.text) or CURRENCY_ONLY.match(word.text):
            seen_price = True
            continue
        if seen_price:
            continue
        if name_words and _normalize(word.text) == _normalize(name_words[-1].text) and len(word.text) >= 5:
            continue
        if (
            name_words
            and len(name_words) >= 2
            and _normalize(word.text) == _normalize(name_words[0].text)
        ):
            break
        name_words.append(word)
    if not name_words:
        return None
    text = _clean_line_text(" ".join(word.text for word in name_words))
    text = _trim_edge_tokens(text)
    if not text:
        return None
    conf = sum(word.conf for word in name_words) / len(name_words)
    return OcrLine(
        text=text,
        x=min(word.x for word in name_words),
        y=min(word.y for word in name_words),
        w=max(word.x2 for word in name_words) - min(word.x for word in name_words),
        h=max(word.y2 for word in name_words) - min(word.y for word in name_words),
        confidence=conf,
    )


def _merge_wrapped_names(lines: list[OcrLine]) -> list[OcrLine]:
    ordered = sorted(lines, key=lambda item: (item.y, item.x))
    merged: list[OcrLine] = []
    for line in ordered:
        partner_index = None
        for index in range(len(merged) - 1, -1, -1):
            prev = merged[index]
            overlap = _x_overlap(prev, line)
            if overlap >= 0.45:
                if _should_wrap(prev, line):
                    partner_index = index
                break
        if partner_index is None:
            merged.append(line)
            continue
        prev = merged[partner_index]
        merged[partner_index] = OcrLine(
            text=_clean_line_text(f"{prev.text} {line.text}"),
            x=min(prev.x, line.x),
            y=min(prev.y, line.y),
            w=max(prev.x + prev.w, line.x + line.w) - min(prev.x, line.x),
            h=max(prev.y + prev.h, line.y + line.h) - min(prev.y, line.y),
            confidence=(prev.confidence + line.confidence) / 2,
        )
    return merged


def _should_wrap(prev: OcrLine, current: OcrLine) -> bool:
    if _x_overlap(prev, current) < 0.45:
        return False
    gap = current.y - (prev.y + prev.h)
    if gap < -0.01 or gap > max(prev.h, current.h) * 0.95:
        return False
    if _is_section(current.text) or _is_description(current.text) or _is_junk(current.text):
        return False
    if _is_description(prev.text) or _is_section(prev.text):
        return False
    prev_norm = _normalize(prev.text).split()
    curr_norm = _normalize(current.text).split()
    if not prev_norm or not curr_norm:
        return False
    if len(curr_norm) > 4:
        return False
    if prev_norm[-1] in CONNECTORS_END:
        return True
    if len(curr_norm) == 1 and curr_norm[0] in STANDALONE_DISHES:
        return False
    if curr_norm[0] in WRAP_START:
        return True
    if len(curr_norm) == 1 and curr_norm[0] in WRAP_WORDS:
        return True
    if (
        len(prev_norm) == 1
        and prev_norm[0] not in WRAP_WORDS
        and len(curr_norm) == 3
        and curr_norm[1] == "de"
    ):
        return True
    return False


def _is_dish_name(text: str, confidence: float = 1.0) -> bool:
    if not text or len(text) < 3:
        return False
    if _is_price(text) or _is_section(text) or _is_description(text) or _is_junk(text):
        return False
    if re.search(r"[(){}[\]|<>@#~^]", text) or "," in text:
        return False
    if re.search(r"(.)\1{2,}", _normalize(text)):
        return False
    letters = sum(ch.isalpha() for ch in text)
    compact = re.sub(r"\s+", "", text)
    if letters < 3 or letters / max(len(compact), 1) < 0.7:
        return False
    tokens = [_normalize(token) for token in text.split() if _normalize(token)]
    if not tokens or len(tokens) > 8:
        return False
    if not any(vowel in "".join(tokens) for vowel in "aeiou"):
        return False
    real_tokens = [token for token in tokens if _token_looks_real(token)]
    if len(real_tokens) < max(1, int(round(len(tokens) * 0.7))):
        return False
    longest = max(len(token) for token in tokens)
    if longest < 4:
        return len(tokens) == 2 and tokens[0] == tokens[1] and len(tokens[0]) >= 3
    if len(tokens) == 1 and longest <= 6 and text.islower():
        return False
    if len(tokens) == 1 and longest <= 4 and confidence < 0.55:
        return False
    return True


def _is_section(text: str) -> bool:
    normalized = _normalize(text)
    if not normalized:
        return False
    if normalized in SECTION_HEADERS:
        return True
    words = normalized.split()
    if len(words) <= 4:
        for header in SECTION_HEADERS:
            if fuzz.ratio(normalized, header) >= 84:
                return True
            if normalized.startswith(header + " "):
                return True
        for word in words:
            if word.startswith("porc") or word.startswith("porg"):
                return True
            for header in SECTION_HEADERS:
                if len(word) >= 6 and fuzz.ratio(word, header) >= 84:
                    return True
    return False


def _is_description(text: str) -> bool:
    normalized = _normalize(text)
    words = normalized.split()
    if text.count(",") >= 1 and len(words) >= 3:
        return True
    if len(words) >= 8:
        return True
    hint_hits = sum(1 for hint in INGREDIENT_HINTS if hint in normalized)
    if hint_hits >= 2 and len(words) >= 3:
        return True
    if normalized.startswith("e ") and hint_hits >= 1:
        return True
    if words and words[0] in {"vinagrete", "gratinada", "acompanha", "servido"} and len(words) >= 2:
        return True
    if len(words) >= 4 and any(word.endswith(("ado", "ada", "ados", "adas")) for word in words[1:3]):
        return True
    return False


def _is_junk(text: str) -> bool:
    normalized = _normalize(text)
    if PHONE_RE.search(text) or HANDLE_RE.match(text):
        return True
    if any(phrase in normalized for phrase in JUNK_PHRASES):
        return True
    if " - " in f" {text} " and text.isupper() and len(text) > 18:
        return True
    if normalized.startswith("entregamos") or "conforto da sua casa" in normalized:
        return True
    return False


def _is_price(text: str) -> bool:
    compact = re.sub(r"\s+", "", text)
    return bool(PRICE_TOKEN.match(compact) or PRICE_TOKEN.match(text.strip()))


def _clean_line_text(text: str) -> str:
    text = CAMEL_RE.sub(r"\1 \2", text)
    text = re.sub(r"\b([cC])/ ?", r"\1/ ", text)
    text = DOT_LEADER.sub(" ", text)
    text = PRICE_IN_TEXT.sub(" ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .-_|•")


def _trim_edge_tokens(text: str) -> str:
    tokens = text.split()
    while tokens and _normalize(tokens[0]) in {"e", "o", "+", "*"}:
        if len(tokens) == 1:
            break
        tokens.pop(0)
    cleaned = []
    seen = set()
    for token in tokens:
        normalized = _normalize(token)
        if (
            cleaned
            and _normalize(cleaned[-1]) == normalized
            and normalized in CONNECTORS_END | {"c/"}
        ):
            continue
        if (
            normalized in seen
            and normalized not in CONNECTORS_END
            and normalized not in {"c/"}
        ):
            if (
                len(cleaned) == 1
                and _normalize(cleaned[0]) == normalized
                and len(normalized) <= 4
            ):
                cleaned.append(token)
            continue
        cleaned.append(token)
        if normalized not in CONNECTORS_END and normalized not in {"c/"}:
            seen.add(normalized)
    tokens = cleaned
    if (
        len(tokens) >= 3
        and _normalize(tokens[0]) == _normalize(tokens[1])
        and _normalize(tokens[0]) not in CONNECTORS_END
    ):
        tokens.pop(1)
    return " ".join(tokens)


def _finalize_name(text: str) -> str:
    tokens = _trim_edge_tokens(text).split()
    while tokens and _normalize(tokens[-1]) in {"c/"} | CONNECTORS_END - {"g"}:
        if _normalize(tokens[-1]) in {"na", "no", "da", "do", "de", "com", "con", "al", "a", "ao", "lo", "alo"}:
            break
        tokens.pop()
    while tokens:
        tail = _normalize(tokens[-1])
        if len(tail) == 1 and tail in {"g", "p", "m"}:
            break
        if len(tail) <= 2 and tail not in CONNECTORS_END and not tail.isdigit():
            tokens.pop()
            continue
        break
    return " ".join(tokens)


def _token_looks_real(token: str) -> bool:
    if token.isdigit() and len(token) <= 2:
        return True
    if len(token) < 3:
        return token in CONNECTORS_END or token in {"c", "g"}
    if not any(vowel in token for vowel in "aeiou"):
        return False
    letters = sum(ch.isalpha() for ch in token)
    return letters / max(len(token), 1) >= 0.8


def _dedupe_dishes(lines: list[OcrLine]) -> list[OcrLine]:
    unique: list[OcrLine] = []
    for line in sorted(lines, key=lambda item: (item.y, item.x)):
        duplicate = False
        for index, existing in enumerate(unique):
            same_text = _normalize(existing.text) == _normalize(line.text)
            overlap = _box_iou(existing, line) > 0.45
            if same_text or overlap:
                if line.confidence > existing.confidence:
                    unique[index] = line
                duplicate = True
                break
        if not duplicate:
            unique.append(line)
    return unique


def _x_overlap(a: OcrLine, b: OcrLine) -> float:
    left = max(a.x, b.x)
    right = min(a.x + a.w, b.x + b.w)
    span = min(a.w, b.w) or 1
    return max(0.0, right - left) / span


def _box_iou(a: OcrLine, b: OcrLine) -> float:
    left = max(a.x, b.x)
    top = max(a.y, b.y)
    right = min(a.x + a.w, b.x + b.w)
    bottom = min(a.y + a.h, b.y + b.h)
    inter = max(0.0, right - left) * max(0.0, bottom - top)
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union else 0.0


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    stripped = stripped.replace("!", "").replace(":", "")
    return re.sub(r"\s+", " ", stripped).strip()
