import logging
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger(__name__)

DETECT_SIDE = 960
WARP_MAX_SIDE = 1800
JPEG_QUALITY = 92


def capture_document(image_bytes: bytes) -> tuple[bytes, int, int]:
    image = _decode(image_bytes)
    quad = _detect_quad(image)
    page = _warp(image, quad) if quad is not None else image
    page = _limit_size(page, WARP_MAX_SIDE)
    return _encode_jpeg(page), page.shape[1], page.shape[0]


def _decode(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is not None and image.size:
        return image
    try:
        pil = Image.open(BytesIO(image_bytes))
        pil = ImageOps.exif_transpose(pil).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("invalid_image") from exc
    rgb = np.array(pil)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def _resize_max(image: np.ndarray, max_side: int) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return image, 1.0
    scale = max_side / longest
    resized = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    return resized, scale


def _limit_size(image: np.ndarray, max_side: int) -> np.ndarray:
    resized, _ = _resize_max(image, max_side)
    return resized


def _order_points(pts: np.ndarray) -> np.ndarray:
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    total = pts.sum(axis=1)
    diff = pts[:, 0] - pts[:, 1]
    ordered = np.array(
        [
            pts[np.argmin(total)],
            pts[np.argmax(diff)],
            pts[np.argmax(total)],
            pts[np.argmin(diff)],
        ],
        dtype=np.float32,
    )
    unique = {tuple(np.round(p, 2)) for p in ordered}
    if len(unique) == 4:
        return ordered
    ys = pts[np.argsort(pts[:, 1])]
    top = ys[:2][np.argsort(ys[:2, 0])]
    bottom = ys[2:][np.argsort(ys[2:, 0])]
    return np.array([top[0], top[1], bottom[1], bottom[0]], dtype=np.float32)


def _side_lengths(pts: np.ndarray) -> tuple[float, float, float, float]:
    tl, tr, br, bl = pts
    return (
        float(np.linalg.norm(tr - tl)),
        float(np.linalg.norm(br - bl)),
        float(np.linalg.norm(bl - tl)),
        float(np.linalg.norm(br - tr)),
    )


def _looks_like_page(pts: np.ndarray, shape: tuple[int, ...]) -> bool:
    height, width = shape[:2]
    ordered = _order_points(pts)
    top, bottom, left, right = _side_lengths(ordered)
    min_side = min(width, height) * 0.12
    if min(top, bottom, left, right) < min_side:
        return False
    area = abs(cv2.contourArea(ordered))
    img_area = float(width * height)
    if area < img_area * 0.12 or area > img_area * 0.97:
        return False
    ratio = max(top, bottom) / max(max(left, right), 1)
    skew = max(top, bottom) / max(min(top, bottom), 1)
    side_skew = max(left, right) / max(min(left, right), 1)
    return 0.28 <= ratio <= 4.2 and skew < 2.4 and side_skew < 2.4


def _quad_from_contour(contour: np.ndarray, shape: tuple[int, ...]) -> np.ndarray | None:
    peri = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
    if len(approx) == 4 and _looks_like_page(approx.reshape(4, 2), shape):
        return approx.reshape(4, 2).astype(np.float32)
    rect = cv2.minAreaRect(contour)
    box = cv2.boxPoints(rect)
    if _looks_like_page(box, shape):
        return box.astype(np.float32)
    return None


def _edge_map(gray: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    median = float(np.median(blurred))
    low = int(max(0, 0.45 * median))
    high = int(min(255, 1.35 * median))
    edges = cv2.Canny(blurred, low, high)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    return cv2.dilate(edges, kernel, iterations=1)


def _binary_map(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    binary = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        8,
    )
    mean = float(np.mean(blur))
    if mean < 115:
        binary = cv2.bitwise_not(binary)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    return cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)


def _best_quad(binary: np.ndarray, shape: tuple[int, ...]) -> np.ndarray | None:
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]
    img_area = shape[0] * shape[1]
    best = None
    best_area = 0.0
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < img_area * 0.12:
            break
        quad = _quad_from_contour(contour, shape)
        if quad is None:
            continue
        quad_area = abs(cv2.contourArea(_order_points(quad)))
        if quad_area > best_area:
            best = quad
            best_area = quad_area
    return best


def _detect_quad(image: np.ndarray) -> np.ndarray | None:
    small, scale = _resize_max(image, DETECT_SIDE)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    candidates = [
        _best_quad(_edge_map(gray), small.shape),
        _best_quad(_binary_map(gray), small.shape),
    ]
    quads = [quad for quad in candidates if quad is not None]
    if not quads:
        logger.info("OpenCV no encontró un recuadro de documento")
        return None
    best = max(quads, key=lambda pts: abs(cv2.contourArea(_order_points(pts))))
    return _order_points(best) / scale


def _warp(image: np.ndarray, quad: np.ndarray) -> np.ndarray:
    src = _order_points(quad)
    top, bottom, left, right = _side_lengths(src)
    width = max(int(max(top, bottom)), 240)
    height = max(int(max(left, right)), 320)
    dst = np.array(
        [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(image, matrix, (width, height), flags=cv2.INTER_CUBIC)


def _enhance_scan(image: np.ndarray) -> np.ndarray:
    pixels = image.astype(np.float32)
    means = pixels.reshape(-1, 3).mean(axis=0)
    gray = float(means.mean())
    scale = np.clip(gray / np.maximum(means, 8.0), 0.84, 1.16)
    balanced = np.clip(pixels * scale, 0, 255).astype(np.uint8)

    lab = cv2.cvtColor(balanced, cv2.COLOR_BGR2LAB)
    light, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.1, tileGridSize=(8, 8))
    light = clahe.apply(light)
    lab = cv2.merge([light, a_ch, b_ch])
    color = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    color = cv2.bilateralFilter(color, d=5, sigmaColor=22, sigmaSpace=22)

    blur = cv2.GaussianBlur(color, (0, 0), 1.15)
    sharp = cv2.addWeighted(color, 1.42, blur, -0.42, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)


def _encode_jpeg(image: np.ndarray) -> bytes:
    ok, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    if not ok:
        raise ValueError("invalid_image")
    return buffer.tobytes()
