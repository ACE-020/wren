import pytest

from wren import store
from wren.db import connect, migrate


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "t.db")
    migrate(c)
    yield c
    c.close()


def test_migrate_is_idempotent(conn):
    assert migrate(conn) == []


def test_one_running_turn_per_session(conn):
    s = store.create_session(conn)
    store.start_turn(conn, s["id"], "hi")
    with pytest.raises(store.TurnConflict):
        store.start_turn(conn, s["id"], "again")


def test_finish_turn_only_once(conn):
    s = store.create_session(conn)
    t = store.start_turn(conn, s["id"], "hi")["turn_id"]
    assert store.finish_turn(conn, t, "stopped")
    assert not store.finish_turn(conn, t, "done")
    assert store.get_turn(conn, t)["status"] == "stopped"


def test_first_message_titles_session(conn):
    s = store.create_session(conn)
    store.start_turn(conn, s["id"], "  帮我\n写一份周报  ")
    assert store.get_session(conn, s["id"])["title"] == "帮我 写一份周报"


def test_history_keeps_full_records_and_skips_current(conn):
    s = store.create_session(conn)["id"]
    t1 = store.start_turn(conn, s, "q1")["turn_id"]
    call = [{"id": "c1", "type": "function", "function": {"name": "echo", "arguments": "{}"}}]
    store.add_message(
        conn,
        s,
        t1,
        {"role": "assistant", "content": "", "reasoning_content": "r", "tool_calls": call},
    )
    store.add_message(
        conn, s, t1, {"role": "tool", "tool_call_id": "c1", "name": "echo", "content": "ok"}
    )
    store.add_message(conn, s, t1, {"role": "assistant", "content": "a1", "reasoning_content": ""})
    store.finish_turn(conn, t1, "done")
    t2 = store.start_turn(conn, s, "q2")["turn_id"]

    hist = store.history(conn, s, t2)
    assert [h["turn_id"] for h in hist] == [t1]
    msgs = hist[0]["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "tool", "assistant"]
    assert msgs[1]["tool_calls"] == call and msgs[1]["reasoning_content"] == "r"
    assert msgs[2]["tool_call_id"] == "c1"


def test_orphan_running_turns_fail_on_startup(conn):
    s = store.create_session(conn)["id"]
    t = store.start_turn(conn, s, "hi")["turn_id"]
    assert store.fail_orphan_turns(conn) == 1
    assert store.get_turn(conn, t)["status"] == "failed"


def test_agent_cannot_write_user_messages(conn):
    s = store.create_session(conn)["id"]
    t = store.start_turn(conn, s, "hi")["turn_id"]
    with pytest.raises(ValueError):
        store.add_message(conn, s, t, {"role": "user", "content": "x"})
