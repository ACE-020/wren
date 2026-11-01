from conftest import TOKEN

H = {"X-Wren-Internal-Token": TOKEN}


def test_agent_creates_and_searches_notes(client):
    sid = client.post("/api/sessions").get_json()["id"]
    r = client.post(
        "/internal/notes",
        headers=H,
        json={"title": "周会", "body": "下周三交 50% 进度", "session_id": sid},
    )
    assert r.status_code == 201
    client.post("/internal/notes", headers=H, json={"title": "购物", "body": "牛奶 鸡蛋"})

    found = client.get("/internal/notes/search?q=进度", headers=H).get_json()["notes"]
    assert [n["title"] for n in found] == ["周会"]
    # LIKE 通配符按字面匹配：「_」不会匹配任意单字
    assert client.get("/internal/notes/search?q=牛_", headers=H).get_json()["notes"] == []
    assert len(client.get("/internal/notes/search?q=%25", headers=H).get_json()["notes"]) == 1
    assert len(client.get("/api/notes").get_json()["notes"]) == 2


def test_note_validation_and_auth(client):
    assert client.post("/internal/notes", json={"title": "a", "body": "b"}).status_code == 401
    assert (
        client.post("/internal/notes", headers=H, json={"title": " ", "body": "b"}).status_code
        == 400
    )


def test_note_survives_session_delete(client):
    sid = client.post("/api/sessions").get_json()["id"]
    note = client.post(
        "/internal/notes", headers=H, json={"title": "t", "body": "b", "session_id": sid}
    ).get_json()
    assert client.delete(f"/api/sessions/{sid}").status_code == 204
    notes = client.get("/api/notes").get_json()["notes"]
    assert notes[0]["id"] == note["id"] and notes[0]["session_id"] is None
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.delete(f"/api/notes/{note['id']}").status_code == 404
