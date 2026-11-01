"""笔记：agent 通过 save_note / search_notes 工具读写，用户在「笔记」页查看和删除。"""

from __future__ import annotations

import sqlite3
from typing import Any

from .db import utcnow

TITLE_MAX = 80
BODY_MAX = 20000


class NoteError(ValueError):
    pass


def _validate(title: Any, body: Any) -> tuple[str, str]:
    if not isinstance(title, str) or not title.strip():
        raise NoteError("title 不能为空")
    if not isinstance(body, str) or not body.strip():
        raise NoteError("body 不能为空")
    if len(title) > TITLE_MAX:
        raise NoteError(f"title 不能超过 {TITLE_MAX} 字")
    if len(body) > BODY_MAX:
        raise NoteError(f"body 不能超过 {BODY_MAX} 字")
    return title.strip(), body.strip()


def create(conn: sqlite3.Connection, title: Any, body: Any, session_id: int | None) -> dict:
    title, body = _validate(title, body)
    now = utcnow()
    cur = conn.execute(
        "INSERT INTO notes (title, body, session_id, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (title, body, session_id, now, now),
    )
    return get(conn, cur.lastrowid)  # type: ignore[return-value, arg-type]


def get(conn: sqlite3.Connection, note_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return dict(row) if row else None


def list_all(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM notes ORDER BY updated_at DESC, id DESC").fetchall()
    return [dict(r) for r in rows]


def search(conn: sqlite3.Connection, query: str, limit: int = 5) -> list[dict]:
    """按关键词（空格分隔，全部命中）匹配标题和正文。"""
    words = [w for w in query.split() if w][:5]
    if not words:
        return []
    where = " AND ".join("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')" for _ in words)
    params: list[Any] = []
    for w in words:
        pattern = "%" + w.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        params += [pattern, pattern]
    rows = conn.execute(
        f"SELECT * FROM notes WHERE {where} ORDER BY updated_at DESC LIMIT ?",
        (*params, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def delete(conn: sqlite3.Connection, note_id: int) -> bool:
    return conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount > 0
