"""SQLite 连接与迁移。

迁移文件放在 `wren/migrations/`，命名为 `NNN_描述.sql`，按编号顺序执行且只执行一次；
已执行的版本记录在 `schema_migrations`。新增表或字段时加一个新文件，不要改已有文件。
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).with_name("migrations")
_MIGRATION_NAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")


def utcnow() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None：自动提交；需要多语句原子性时用 transaction()。
    conn = sqlite3.connect(path, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def pending_migrations(conn: sqlite3.Connection) -> list[Path]:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    )
    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
    files = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        match = _MIGRATION_NAME.match(path.name)
        if not match:
            raise RuntimeError(f"迁移文件名不合规：{path.name}（应为 NNN_描述.sql）")
        if match.group(1) not in applied:
            files.append(path)
    return files


def migrate(conn: sqlite3.Connection) -> list[str]:
    """执行所有未执行的迁移，返回本次执行的版本号。"""
    done = []
    for path in pending_migrations(conn):
        version = path.name[:3]
        sql = path.read_text(encoding="utf-8")
        # executescript 会先提交当前事务，所以把记录版本的语句放进同一段脚本里。
        conn.executescript(
            "BEGIN;\n"
            f"{sql}\n"
            "INSERT INTO schema_migrations (version, applied_at)"
            f" VALUES ('{version}', '{utcnow()}');\n"
            "COMMIT;"
        )
        done.append(version)
    return done
