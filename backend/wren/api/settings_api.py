"""设置接口（浏览器调用）。"""

from __future__ import annotations

import requests
from flask import Blueprint, abort

from .. import settings
from . import cfg, db, json_body

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("/model")
def get_model():
    return settings.public_model(db())


@bp.put("/model")
def put_model():
    try:
        settings.update_model(db(), json_body())
    except settings.SettingsError as exc:
        abort(400, str(exc))
    return settings.public_model(db())


@bp.post("/model/test")
def test_model():
    """用已保存的配置向模型发一次最小请求，确认地址、key、模型名可用。"""
    model = settings.get_model(db())
    if not model["api_key"]:
        abort(400, "尚未填写 API key")
    try:
        resp = requests.post(
            f"{model['base_url']}/chat/completions",
            headers={"Authorization": f"Bearer {model['api_key']}"},
            json={
                "model": model["model"],
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1,
                "stream": False,
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        return {"ok": False, "error": f"连接失败：{exc.__class__.__name__}"}
    if resp.status_code != 200:
        return {"ok": False, "error": f"HTTP {resp.status_code}：{resp.text[:300]}"}
    return {"ok": True, "model": resp.json().get("model")}


@bp.get("/tools")
def get_tools():
    """工具列表来自 agent（工具在 agent 里注册），开关状态来自数据库。"""
    try:
        resp = requests.get(
            f"{cfg().agent_url}/tools",
            headers={"X-Wren-Internal-Token": cfg().internal_token},
            timeout=5,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        abort(502, f"无法从 agent 获取工具列表：{exc.__class__.__name__}")
    switches = settings.get_tool_switches(db())
    tools = [
        {**tool, "enabled": switches.get(tool["name"], True)}
        for tool in resp.json()["tools"]
        if tool.get("toggleable", True)
    ]
    return {"tools": tools}


@bp.put("/tools")
def put_tools():
    try:
        settings.update_tool_switches(db(), json_body())
    except settings.SettingsError as exc:
        abort(400, str(exc))
    return {"tools": settings.get_tool_switches(db())}


@bp.get("/system-prompt")
def get_system_prompt():
    return {"system_prompt": settings.get_system_prompt(db())}


@bp.put("/system-prompt")
def put_system_prompt():
    try:
        text = settings.update_system_prompt(db(), json_body().get("system_prompt"))
    except settings.SettingsError as exc:
        abort(400, str(exc))
    return {"system_prompt": text}
