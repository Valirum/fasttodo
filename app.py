from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory

from database import get_db, init_db

app = Flask(__name__)
init_db()
ROOT = Path(__file__).parent


def task_to_dict(row, items):
    total = len(items)
    done = sum(1 for i in items if i["completed"])
    percent = round(done / total * 100) if total else 0
    return {
        "id": row["id"],
        "title": row["title"],
        "position": row["position"],
        "created_at": row["created_at"],
        "items": items,
        "progress": {"done": done, "total": total, "percent": percent},
    }


def fetch_items(conn, task_id):
    rows = conn.execute(
        "SELECT id, name, completed, position FROM items "
        "WHERE task_id = ? ORDER BY position, id",
        (task_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "completed": bool(r["completed"]),
            "position": r["position"],
        }
        for r in rows
    ]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/icon.png")
@app.route("/favicon.ico")
def favicon():
    return send_from_directory(ROOT, "icon.png", mimetype="image/png")


@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    with get_db() as conn:
        tasks = conn.execute(
            "SELECT id, title, position, created_at FROM tasks "
            "ORDER BY position ASC, id ASC"
        ).fetchall()
        return jsonify(
            [
                task_to_dict(t, fetch_items(conn, t["id"]))
                for t in tasks
            ]
        )


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "Название задачи обязательно"}), 400

    with get_db() as conn:
        conn.execute("UPDATE tasks SET position = position + 1")
        cur = conn.execute(
            "INSERT INTO tasks (title, position) VALUES (?, 0)", (title,)
        )
        task_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        conn.commit()
        return jsonify(task_to_dict(row, [])), 201


@app.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Задача не найдена"}), 404
        return jsonify(task_to_dict(row, fetch_items(conn, task_id)))


@app.route("/api/tasks/reorder", methods=["PUT"])
def reorder_tasks():
    data = request.get_json(silent=True) or {}
    order = data.get("order")
    if not isinstance(order, list) or not all(isinstance(i, int) for i in order):
        return jsonify({"error": "Нужен массив id задач"}), 400

    with get_db() as conn:
        existing = {r["id"] for r in conn.execute("SELECT id FROM tasks").fetchall()}
        if set(order) != existing:
            return jsonify({"error": "Неверный порядок задач"}), 400
        for pos, task_id in enumerate(order):
            conn.execute(
                "UPDATE tasks SET position = ? WHERE id = ?", (pos, task_id)
            )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cur.rowcount == 0:
            conn.commit()
            return jsonify({"error": "Задача не найдена"}), 404
        rows = conn.execute(
            "SELECT id FROM tasks ORDER BY position ASC, id ASC"
        ).fetchall()
        for pos, row in enumerate(rows):
            conn.execute(
                "UPDATE tasks SET position = ? WHERE id = ?", (pos, row["id"])
            )
        conn.commit()
        return "", 204


@app.route("/api/tasks/<int:task_id>/items", methods=["POST"])
def create_item(task_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()

    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not task:
            return jsonify({"error": "Задача не найдена"}), 404

        count = conn.execute(
            "SELECT COUNT(*) AS c FROM items WHERE task_id = ?", (task_id,)
        ).fetchone()["c"]

        if not name:
            name = f"Пункт №{count + 1}"

        position = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE task_id = ?",
            (task_id,),
        ).fetchone()["p"]

        cur = conn.execute(
            "INSERT INTO items (task_id, name, position) VALUES (?, ?, ?)",
            (task_id, name, position),
        )
        item_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, completed, position FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.commit()
        return jsonify(
            {
                "id": row["id"],
                "name": row["name"],
                "completed": bool(row["completed"]),
                "position": row["position"],
            }
        ), 201


@app.route("/api/items/<int:item_id>", methods=["PATCH"])
def update_item(item_id):
    data = request.get_json(silent=True) or {}

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, completed, position FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Пункт не найден"}), 404

        name = data.get("name")
        completed = data.get("completed")

        new_name = name.strip() if isinstance(name, str) and name.strip() else row["name"]
        new_completed = (
            int(bool(completed)) if completed is not None else row["completed"]
        )

        conn.execute(
            "UPDATE items SET name = ?, completed = ? WHERE id = ?",
            (new_name, new_completed, item_id),
        )
        conn.commit()

        return jsonify(
            {
                "id": item_id,
                "name": new_name,
                "completed": bool(new_completed),
                "position": row["position"],
            }
        )


@app.route("/api/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Пункт не найден"}), 404
        return "", 204


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
