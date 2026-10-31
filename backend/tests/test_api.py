import threading
import time

from conftest import TOKEN, read_sse


def _wait_status(client, sid, status, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        turns = client.get(f"/api/sessions/{sid}/turns").get_json()["turns"]
        if turns and turns[-1]["status"] == status:
            return turns[-1]
        time.sleep(0.05)
    raise AssertionError(f"回合未进入 {status}：{turns}")


def _session(client):
    return client.post("/api/sessions").get_json()["id"]


def test_turn_persists_agent_messages_and_streams_events(client, agent):
    agent.script = [
        {"type": "step_start", "step": 1},
        {"type": "text_delta", "text": "你好"},
        {
            "type": "message",
            "message": {"role": "assistant", "content": "你好", "reasoning_content": "想"},
        },
        {"type": "usage", "usage": {"prompt_tokens": 10, "completion_tokens": 2}},
        {"type": "turn_end", "status": "done"},
    ]
    sid = _session(client)
    turn_id = client.post(f"/api/sessions/{sid}/turns", json={"content": "hi"}).get_json()[
        "turn_id"
    ]

    events = read_sse(client.get(f"/api/turns/{turn_id}/events"))
    assert [e["type"] for e in events] == [
        "turn_start",
        "step_start",
        "text_delta",
        "message",
        "usage",
        "turn_end",
    ]
    assert events[-1]["status"] == "done"

    turn = _wait_status(client, sid, "done")
    assert [m["role"] for m in turn["messages"]] == ["user", "assistant"]
    assert turn["usage"] == {"prompt_tokens": 10, "completion_tokens": 2}
    req = agent.requests[0]
    assert req["token"] == TOKEN and req["body"] == {"session_id": sid, "turn_id": turn_id}


def test_second_turn_while_running_is_conflict(client, agent):
    agent.script = [{"type": "_hold"}, {"type": "turn_end", "status": "done"}]
    sid = _session(client)
    assert client.post(f"/api/sessions/{sid}/turns", json={"content": "a"}).status_code == 201
    assert client.post(f"/api/sessions/{sid}/turns", json={"content": "b"}).status_code == 409
    agent.released.set()
    _wait_status(client, sid, "done")


def test_stop_forwards_abort_and_ends_stopped(client, agent):
    agent.script = [
        {"type": "text_delta", "text": "部分"},
        {"type": "_hold"},
        {"type": "turn_end", "status": "stopped"},
    ]
    sid = _session(client)
    turn_id = client.post(f"/api/sessions/{sid}/turns", json={"content": "a"}).get_json()["turn_id"]
    assert client.post(f"/api/turns/{turn_id}/stop").status_code == 202
    _wait_status(client, sid, "stopped")
    assert agent.aborted == [turn_id]


def test_agent_stream_ending_without_turn_end_fails_turn(client, agent):
    agent.script = [{"type": "text_delta", "text": "x"}]
    sid = _session(client)
    client.post(f"/api/sessions/{sid}/turns", json={"content": "a"})
    turn = _wait_status(client, sid, "failed")
    assert "意外结束" in turn["error"]


def test_unreachable_agent_fails_turn(client, app):
    app.config["WREN"] = app.config["WREN"].__class__(
        **{**app.config["WREN"].__dict__, "agent_url": "http://127.0.0.1:9"}
    )
    sid = _session(client)
    client.post(f"/api/sessions/{sid}/turns", json={"content": "a"})
    turn = _wait_status(client, sid, "failed")
    assert "无法连接 agent" in turn["error"]


def test_late_subscriber_gets_replay(client, agent):
    agent.script = [{"type": "text_delta", "text": "a"}, {"type": "turn_end", "status": "done"}]
    sid = _session(client)
    turn_id = client.post(f"/api/sessions/{sid}/turns", json={"content": "a"}).get_json()["turn_id"]
    _wait_status(client, sid, "done")
    events = read_sse(client.get(f"/api/turns/{turn_id}/events"))
    assert [e["type"] for e in events] == ["turn_start", "text_delta", "turn_end"]


def test_internal_requires_token(client):
    sid = _session(client)
    assert client.get("/internal/turns/1/context").status_code == 401
    assert (
        client.get(
            "/internal/turns/1/context", headers={"X-Wren-Internal-Token": "wrong"}
        ).status_code
        == 401
    )
    del sid


def test_internal_context_contains_history_and_key(client, agent):
    agent.script = [
        {"type": "message", "message": {"role": "assistant", "content": "a1"}},
        {"type": "turn_end", "status": "done"},
    ]
    client.put("/api/settings/model", json={"api_key": "sk-secret-123456"})
    sid = _session(client)
    client.post(f"/api/sessions/{sid}/turns", json={"content": "q1"})
    _wait_status(client, sid, "done")
    agent.script = [{"type": "_hold"}, {"type": "turn_end", "status": "done"}]
    t2 = client.post(f"/api/sessions/{sid}/turns", json={"content": "q2"}).get_json()["turn_id"]

    ctx = client.get(
        f"/internal/turns/{t2}/context", headers={"X-Wren-Internal-Token": TOKEN}
    ).get_json()
    assert ctx["model"]["api_key"] == "sk-secret-123456"
    assert ctx["user_message"] == {"role": "user", "content": "q2"}
    assert [m["content"] for m in ctx["history"][0]["messages"]] == ["q1", "a1"]
    agent.released.set()


def test_public_model_never_returns_key(client):
    client.put("/api/settings/model", json={"api_key": "sk-secret-123456"})
    body = client.get("/api/settings/model").get_json()
    assert "api_key" not in body
    assert body["api_key_set"] is True and body["api_key_hint"] == "…3456"
    # 空字符串表示不修改
    client.put("/api/settings/model", json={"api_key": "", "model": "m2"})
    assert client.get("/api/settings/model").get_json()["api_key_set"] is True


def test_model_settings_validation(client):
    assert client.put("/api/settings/model", json={"base_url": "ftp://x"}).status_code == 400
    assert client.put("/api/settings/model", json={"max_steps": 0}).status_code == 400
    assert client.put("/api/settings/model", json={"nope": 1}).status_code == 400


def test_tool_list_merges_switches(client, agent):
    agent.tools = [
        {"name": "echo", "description": "", "toggleable": True},
        {"name": "hidden", "description": "", "toggleable": False},
    ]
    client.put("/api/settings/tools", json={"echo": False})
    tools = client.get("/api/settings/tools").get_json()["tools"]
    assert tools == [{"name": "echo", "description": "", "toggleable": True, "enabled": False}]


def test_delete_session_with_running_turn_is_conflict(client, agent):
    agent.script = [{"type": "_hold"}, {"type": "turn_end", "status": "done"}]
    sid = _session(client)
    client.post(f"/api/sessions/{sid}/turns", json={"content": "a"})
    assert client.delete(f"/api/sessions/{sid}").status_code == 409
    agent.released.set()
    _wait_status(client, sid, "done")
    assert client.delete(f"/api/sessions/{sid}").status_code == 204


def test_concurrent_turns_in_different_sessions(client, agent):
    agent.script = [{"type": "turn_end", "status": "done"}]
    sids = [_session(client) for _ in range(3)]
    threads = [
        threading.Thread(
            target=client.post,
            args=(f"/api/sessions/{s}/turns",),
            kwargs={"json": {"content": "x"}},
        )
        for s in sids
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    for s in sids:
        _wait_status(client, s, "done")
