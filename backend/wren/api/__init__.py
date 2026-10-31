"""HTTP 接口。每个模块一个蓝图；公共工具函数放在这里。"""

from __future__ import annotations

import sqlite3
from typing import Any

from flask import abort, current_app, g, request

from ..config import Config


def cfg() -> Config:
    return current_app.config["WREN"]


def db() -> sqlite3.Connection:
    """每个请求一个连接，请求结束时关闭（见 teardown）。"""
    if "wren_db" not in g:
        from ..db import connect

        g.wren_db = connect(cfg().db_path)
    return g.wren_db


def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("wren_db", None)
    if conn is not None:
        conn.close()


def json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, "请求体必须是 JSON 对象")
    return body
