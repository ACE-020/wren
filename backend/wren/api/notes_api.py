"""笔记接口：浏览器用 /api/notes，agent 的工具用 /internal/notes。"""

from __future__ import annotations

from flask import Blueprint, abort, request

from .. import notes
from . import db, json_body
from .internal import require_token

bp = Blueprint("notes", __name__, url_prefix="/api/notes")
internal_bp = Blueprint("notes_internal", __name__, url_prefix="/internal/notes")
internal_bp.before_request(require_token)


@bp.get("")
def list_notes():
    return {"notes": notes.list_all(db())}


@bp.delete("/<int:note_id>")
def delete_note(note_id: int):
    if not notes.delete(db(), note_id):
        abort(404, "笔记不存在")
    return "", 204


@internal_bp.post("")
def create_note():
    body = json_body()
    session_id = body.get("session_id")
    if session_id is not None and not isinstance(session_id, int):
        abort(400, "session_id 必须是整数")
    try:
        note = notes.create(db(), body.get("title"), body.get("body"), session_id)
    except notes.NoteError as exc:
        abort(400, str(exc))
    return note, 201


@internal_bp.get("/search")
def search_notes():
    query = request.args.get("q", "")
    limit = min(max(request.args.get("limit", 5, type=int), 1), 20)
    return {"notes": notes.search(db(), query, limit)}
