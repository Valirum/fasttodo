import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "todo.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
        """)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(tasks)").fetchall()}
        if "position" not in cols:
            conn.execute(
                "ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
            )
            rows = conn.execute(
                "SELECT id FROM tasks ORDER BY created_at DESC, id DESC"
            ).fetchall()
            for i, row in enumerate(rows):
                conn.execute(
                    "UPDATE tasks SET position = ? WHERE id = ?", (i, row["id"])
                )
        conn.commit()
