"""回合运行器：每个回合一个后台线程，读 agent 的事件流、落库、分发给浏览器订阅者。

浏览器断开不影响回合继续；重新订阅时会先补发本回合已产生的全部事件。
运行器只在本进程内存里，因此后端必须单进程运行（开发服务器即可）。
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Iterator
from typing import Any

import requests

from . import store
from .config import Config
from .db import connect

log = logging.getLogger(__name__)

# 点了停止之后，agent 多久没收尾就由后端强制结束（秒）。
STOP_GRACE_SECONDS = 10.0
# 回合结束后运行器在内存里保留多久，供晚到的订阅者补读事件（秒）。
KEEP_FINISHED_SECONDS = 60.0


class TurnRunner:
    def __init__(self, cfg: Config, session_id: int, turn_id: int, user_message_id: int):
        self.cfg = cfg
        self.session_id = session_id
        self.turn_id = turn_id
        self._events: list[dict[str, Any]] = []
        self._cond = threading.Condition()
        self._ended = False
        self._stop_requested = False
        self._response: requests.Response | None = None
        self._usage: dict[str, int] = {}
        self.finished_at: float | None = None
        self._publish(
            {"type": "turn_start", "turn_id": turn_id, "user_message_id": user_message_id}
        )

    # ---- lifecycle ----------------------------------------------------------

    def start(self) -> None:
        threading.Thread(target=self._run, name=f"turn-{self.turn_id}", daemon=True).start()

    def request_stop(self) -> None:
        with self._cond:
            if self._ended or self._stop_requested:
                return
            self._stop_requested = True
        try:
            requests.post(
                f"{self.cfg.agent_url}/turns/{self.turn_id}/abort",
                headers=self._headers(),
                timeout=3,
            )
        except requests.RequestException as exc:
            log.warning("turn %s: 通知 agent 停止失败：%s", self.turn_id, exc)
        timer = threading.Timer(STOP_GRACE_SECONDS, self._force_stop)
        timer.daemon = True
        timer.start()

    def _force_stop(self) -> None:
        if self._end("stopped", None):
            log.warning(
                "turn %s: agent 未在 %ss 内收尾，已强制停止", self.turn_id, STOP_GRACE_SECONDS
            )
            response = self._response
            if response is not None:
                response.close()

    def _run(self) -> None:
        conn = connect(self.cfg.db_path)
        error: str | None = None
        try:
            with requests.post(
                f"{self.cfg.agent_url}/turns",
                json={"session_id": self.session_id, "turn_id": self.turn_id},
                headers=self._headers(),
                stream=True,
                timeout=(5, self.cfg.agent_read_timeout),
            ) as response:
                self._response = response
                if response.status_code != 200:
                    raise RuntimeError(f"agent 返回 {response.status_code}：{response.text[:300]}")
                for line in response.iter_lines():
                    if self._ended:
                        break
                    if line:
                        self._handle(conn, json.loads(line))
        except requests.ConnectionError as exc:
            if not self._ended:
                error = f"无法连接 agent（{self.cfg.agent_url}）：{exc.__class__.__name__}"
        except Exception as exc:  # noqa: BLE001 — 任何异常都要让回合进入终态
            if not self._ended:
                log.exception("turn %s 异常", self.turn_id)
                error = str(exc) or exc.__class__.__name__
        finally:
            if not self._ended:
                status = "stopped" if self._stop_requested else "failed"
                self._end(
                    status, error or ("agent 事件流意外结束" if status == "failed" else None), conn
                )
            conn.close()

    # ---- events -------------------------------------------------------------

    def _handle(self, conn, event: dict[str, Any]) -> None:
        kind = event.get("type")
        if kind == "message":
            msg = event["message"]
            msg_id = store.add_message(conn, self.session_id, self.turn_id, msg)
            event = {**event, "message": {**msg, "id": msg_id}}
        elif kind == "usage":
            for key, value in (event.get("usage") or {}).items():
                if isinstance(value, int):
                    self._usage[key] = self._usage.get(key, 0) + value
        elif kind == "turn_end":
            self._end(event.get("status", "failed"), event.get("error"), conn)
            return
        self._publish(event)

    def _end(self, status: str, error: str | None, conn=None) -> bool:
        with self._cond:
            if self._ended:
                return False
            self._ended = True
        own = conn is None
        conn = conn or connect(self.cfg.db_path)
        try:
            store.finish_turn(conn, self.turn_id, status, error, self._usage or None)
            final = store.get_turn(conn, self.turn_id) or {}
        finally:
            if own:
                conn.close()
        self.finished_at = time.monotonic()
        self._publish(
            {
                "type": "turn_end",
                "turn_id": self.turn_id,
                "status": final.get("status", status),
                "error": final.get("error"),
                "usage": self._usage or None,
            },
            force=True,
        )
        return True

    def _publish(self, event: dict[str, Any], force: bool = False) -> None:
        with self._cond:
            if self._ended and not force:
                return
            self._events.append(event)
            self._cond.notify_all()

    def subscribe(self, heartbeat: float = 15.0) -> Iterator[dict[str, Any] | None]:
        """从头补发并持续推送事件；`None` 表示心跳。turn_end 之后结束。"""
        index = 0
        while True:
            with self._cond:
                if index >= len(self._events):
                    self._cond.wait(timeout=heartbeat)
                batch = self._events[index:]
                index += len(batch)
            if not batch:
                yield None
                continue
            for event in batch:
                yield event
                if event["type"] == "turn_end":
                    return

    def _headers(self) -> dict[str, str]:
        return {"X-Wren-Internal-Token": self.cfg.internal_token}


class TurnRegistry:
    def __init__(self) -> None:
        self._runners: dict[int, TurnRunner] = {}
        self._lock = threading.Lock()

    def add(self, runner: TurnRunner) -> None:
        with self._lock:
            self._prune()
            self._runners[runner.turn_id] = runner

    def get(self, turn_id: int) -> TurnRunner | None:
        with self._lock:
            return self._runners.get(turn_id)

    def _prune(self) -> None:
        now = time.monotonic()
        for turn_id, runner in list(self._runners.items()):
            if runner.finished_at is not None and now - runner.finished_at > KEEP_FINISHED_SECONDS:
                del self._runners[turn_id]
