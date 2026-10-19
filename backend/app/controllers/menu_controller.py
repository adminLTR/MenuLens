from flask import Blueprint, Response, request

from app.services.document_capture import capture_document
from app.services.menu_scan_service import MenuScanService
from app.views.response import json_error, json_ok

menu_bp = Blueprint("menus", __name__)


@menu_bp.post("/menus/scan")
@menu_bp.post("/api/menus/scan")
def scan_menu():
    upload = request.files.get("image") or request.files.get("file")
    if not upload:
        return json_error(
            {
                "error": "missing_image",
                "message": "Envie uma fotografia do cardápio no campo image.",
            },
            400,
        )

    payload = upload.read()
    if not payload:
        return json_error(
            {
                "error": "empty_image",
                "message": "A imagem do cardápio chegou vazia.",
            },
            400,
        )

    menu_id = request.form.get("menu_id", type=int)
    crop = str(request.form.get("crop") or "").lower() in {"1", "true", "yes"}
    debug = str(request.form.get("debug") or "").lower() in {"1", "true", "yes"}
    try:
        result = MenuScanService.scan(payload, menu_id=menu_id, crop=crop, debug=debug)
    except ValueError as exc:
        code = str(exc)
        if code == "invalid_image":
            return json_error(
                {
                    "error": "invalid_image",
                    "message": "Não foi possível ler este ficheiro como imagem.",
                },
                400,
            )
        if code == "ocr_unavailable":
            return json_error(
                {
                    "error": "ocr_unavailable",
                    "message": "O motor de leitura não está instalado neste servidor.",
                },
                503,
            )
        raise

    return json_ok(result)


@menu_bp.post("/menus/capture")
@menu_bp.post("/api/menus/capture")
def capture_menu():
    upload = request.files.get("image") or request.files.get("file")
    if not upload:
        return json_error(
            {
                "error": "missing_image",
                "message": "Envie uma fotografia do cardápio no campo image.",
            },
            400,
        )

    payload = upload.read()
    if not payload:
        return json_error(
            {
                "error": "empty_image",
                "message": "A imagem do cardápio chegou vazia.",
            },
            400,
        )

    try:
        jpeg, width, height = capture_document(payload)
    except ValueError as exc:
        code = str(exc)
        if code == "invalid_image":
            return json_error(
                {
                    "error": "invalid_image",
                    "message": "Não foi possível ler este ficheiro como imagem.",
                },
                400,
            )
        raise
    except ImportError:
        return json_error(
            {
                "error": "opencv_unavailable",
                "message": "OpenCV no está instalado en este servidor.",
            },
            503,
        )

    response = Response(jpeg, mimetype="image/jpeg")
    response.headers["X-Page-Width"] = str(width)
    response.headers["X-Page-Height"] = str(height)
    return response
