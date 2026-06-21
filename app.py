from pathlib import Path
import argparse

from flask import Flask, Response, jsonify, render_template, request, send_from_directory

from database import get_db, init_db
from themes import discover_themes, themes_bundle_css

app = Flask(__name__)
init_db()
ROOT = Path(__file__).parent


def task_to_dict(row, items, sections):
    total = len(items)
    done = sum(1 for i in items if i["completed"])
    percent = round(done / total * 100) if total else 0
    return {
        "id": row["id"],
        "title": row["title"],
        "position": row["position"],
        "created_at": row["created_at"],
        "items": items,
        "sections": sections,
        "progress": {"done": done, "total": total, "percent": percent},
    }


def fetch_sections(conn, task_id):
    rows = conn.execute(
        "SELECT id, title, position FROM sections "
        "WHERE task_id = ? ORDER BY position, id",
        (task_id,),
    ).fetchall()
    return [
        {"id": r["id"], "title": r["title"], "position": r["position"]}
        for r in rows
    ]


def fetch_items(conn, task_id):
    rows = conn.execute(
        "SELECT id, name, completed, position, section_id FROM items "
        "WHERE task_id = ? ORDER BY position, id",
        (task_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "completed": bool(r["completed"]),
            "position": r["position"],
            "section_id": r["section_id"],
        }
        for r in rows
    ]


def task_payload(conn, task_id):
    row = conn.execute(
        "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
        (task_id,),
    ).fetchone()
    if not row:
        return None
    return task_to_dict(row, fetch_items(conn, task_id), fetch_sections(conn, task_id))


def build_display_blocks(items, sections):
    elements = [
        *[{"type": "section", **s} for s in sections],
        *[{"type": "item", **i} for i in items],
    ]
    elements.sort(
        key=lambda el: (el["position"], 0 if el["type"] == "section" else 1)
    )

    blocks = []
    loose = []
    open_section = None
    section_items = []

    def flush_loose():
        nonlocal loose
        if loose:
            blocks.append({"type": "loose", "items": loose})
            loose = []

    def flush_section():
        nonlocal open_section, section_items
        if open_section:
            if section_items:
                blocks.append(
                    {
                        "type": "section",
                        "section": open_section,
                        "items": section_items,
                    }
                )
            open_section = None
            section_items = []

    for el in elements:
        if el["type"] == "item" and not el["section_id"]:
            flush_section()
            loose.append(el)
        elif el["type"] == "section":
            flush_loose()
            flush_section()
            open_section = {
                "id": el["id"],
                "title": el["title"],
                "position": el["position"],
            }
        elif el["type"] == "item" and el["section_id"]:
            if open_section and open_section["id"] == el["section_id"]:
                section_items.append(el)
            else:
                flush_section()
                loose.append(el)

    flush_loose()
    flush_section()
    return blocks


def apply_layout_positions(conn, task_id, items, sections):
    blocks = build_display_blocks(items, sections)
    used_section_ids = set()
    pos = 0

    for block in blocks:
        if block["type"] == "loose":
            for item in block["items"]:
                conn.execute(
                    "UPDATE items SET position = ?, section_id = NULL WHERE id = ?",
                    (pos, item["id"]),
                )
                pos += 1
        elif block["type"] == "section":
            section = block["section"]
            used_section_ids.add(section["id"])
            conn.execute(
                "UPDATE sections SET position = ? WHERE id = ?",
                (pos, section["id"]),
            )
            pos += 1
            for item in block["items"]:
                conn.execute(
                    "UPDATE items SET position = ?, section_id = ? WHERE id = ?",
                    (pos, section["id"], item["id"]),
                )
                pos += 1

    for section in sections:
        if section["id"] not in used_section_ids:
            conn.execute("DELETE FROM sections WHERE id = ?", (section["id"],))


def purge_empty_sections(conn, task_id):
    conn.execute(
        """
        DELETE FROM sections
        WHERE task_id = ?
          AND id NOT IN (
            SELECT section_id FROM items
            WHERE task_id = ? AND section_id IS NOT NULL
          )
        """,
        (task_id, task_id),
    )


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/themes", methods=["GET"])
def list_themes():
    return jsonify(discover_themes())


@app.route("/api/themes.css")
def themes_bundle():
    return Response(themes_bundle_css(), mimetype="text/css")


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
                task_to_dict(
                    t, fetch_items(conn, t["id"]), fetch_sections(conn, t["id"])
                )
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
        return jsonify(task_to_dict(row, [], [])), 201


@app.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Задача не найдена"}), 404
        payload = task_payload(conn, task_id)
        if not payload:
            return jsonify({"error": "Задача не найдена"}), 404
        return jsonify(payload)


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


@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    data = request.get_json(silent=True) or {}
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Название задачи обязательно"}), 400

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Задача не найдена"}), 404

        new_title = title.strip()
        conn.execute(
            "UPDATE tasks SET title = ? WHERE id = ?", (new_title, task_id)
        )
        conn.commit()
        updated = conn.execute(
            "SELECT id, title, position, created_at FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        return jsonify(task_to_dict(updated, fetch_items(conn, task_id), fetch_sections(conn, task_id)))


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

        section_id = data.get("section_id")
        if section_id is not None:
            section_id = int(section_id) if section_id else None
            if section_id:
                sec = conn.execute(
                    "SELECT id FROM sections WHERE id = ? AND task_id = ?",
                    (section_id, task_id),
                ).fetchone()
                if not sec:
                    return jsonify({"error": "Секция не найдена"}), 404

        count = conn.execute(
            "SELECT COUNT(*) AS c FROM items WHERE task_id = ?", (task_id,)
        ).fetchone()["c"]

        if not name:
            name = f"Пункт №{count + 1}"

        if section_id:
            section_row = conn.execute(
                "SELECT position FROM sections WHERE id = ?", (section_id,)
            ).fetchone()
            section_items = conn.execute(
                "SELECT position FROM items WHERE task_id = ? AND section_id = ?",
                (task_id, section_id),
            ).fetchall()
            positions = [section_row["position"]] + [r["position"] for r in section_items]
            position = max(positions) + 1
        else:
            position = conn.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items WHERE task_id = ?",
                (task_id,),
            ).fetchone()["p"]

        cur = conn.execute(
            "INSERT INTO items (task_id, name, position, section_id) VALUES (?, ?, ?, ?)",
            (task_id, name, position, section_id),
        )
        item_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, completed, position, section_id FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        conn.commit()
        return jsonify(
            {
                "id": row["id"],
                "name": row["name"],
                "completed": bool(row["completed"]),
                "position": row["position"],
                "section_id": row["section_id"],
            }
        ), 201


@app.route("/api/tasks/<int:task_id>/items/reorder", methods=["PUT"])
def reorder_items(task_id):
    data = request.get_json(silent=True) or {}
    order = data.get("order")
    if not isinstance(order, list) or not all(isinstance(i, int) for i in order):
        return jsonify({"error": "Нужен массив id пунктов"}), 400

    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not task:
            return jsonify({"error": "Задача не найдена"}), 404

        existing = {
            r["id"]
            for r in conn.execute(
                "SELECT id FROM items WHERE task_id = ?", (task_id,)
            ).fetchall()
        }
        if set(order) != existing:
            return jsonify({"error": "Неверный порядок пунктов"}), 400

        for pos, item_id in enumerate(order):
            conn.execute(
                "UPDATE items SET position = ? WHERE id = ?", (pos, item_id)
            )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/tasks/<int:task_id>/layout", methods=["PUT"])
def update_layout(task_id):
    data = request.get_json(silent=True) or {}
    items_layout = data.get("items")
    sections_layout = data.get("sections")
    if not isinstance(items_layout, list) or not isinstance(sections_layout, list):
        return jsonify({"error": "Нужны items и sections"}), 400

    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not task:
            return jsonify({"error": "Задача не найдена"}), 404

        existing_items = {
            r["id"]
            for r in conn.execute(
                "SELECT id FROM items WHERE task_id = ?", (task_id,)
            ).fetchall()
        }
        existing_sections = {
            r["id"]
            for r in conn.execute(
                "SELECT id FROM sections WHERE task_id = ?", (task_id,)
            ).fetchall()
        }

        item_ids = {entry["id"] for entry in items_layout if isinstance(entry.get("id"), int)}
        if item_ids != existing_items:
            return jsonify({"error": "Неверная структура"}), 400

        for entry in sections_layout:
            if entry.get("id") not in existing_sections:
                return jsonify({"error": "Неверная структура"}), 400
            title = (entry.get("title") or "").strip() or "Секция"
            conn.execute(
                "UPDATE sections SET position = ?, title = ? WHERE id = ?",
                (entry["position"], title, entry["id"]),
            )

        for entry in items_layout:
            section_id = entry.get("section_id")
            section_id = int(section_id) if section_id else None
            if section_id and section_id not in existing_sections:
                return jsonify({"error": "Неверная структура"}), 400
            conn.execute(
                "UPDATE items SET position = ?, section_id = ? WHERE id = ?",
                (entry["position"], section_id, entry["id"]),
            )

        purge_empty_sections(conn, task_id)
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/tasks/<int:task_id>/sections", methods=["POST"])
def create_section(task_id):
    data = request.get_json(silent=True) or {}
    from_item_id = data.get("from_item_id")
    title = (data.get("title") or "").strip()

    if not isinstance(from_item_id, int):
        return jsonify({"error": "Нужен from_item_id"}), 400

    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not task:
            return jsonify({"error": "Задача не найдена"}), 404

        items = fetch_items(conn, task_id)
        sections = fetch_sections(conn, task_id)
        from_item = next((i for i in items if i["id"] == from_item_id), None)
        if not from_item:
            return jsonify({"error": "Пункт не найден"}), 404

        if not title:
            title = f"Секция {len(sections) + 1}"

        merged = []
        for s in sections:
            merged.append(("section", s))
        for i in items:
            merged.append(("item", i))
        merged.sort(key=lambda x: (x[1]["position"], 0 if x[0] == "section" else 1))

        start_idx = next(
            (idx for idx, (kind, el) in enumerate(merged)
             if kind == "item" and el["id"] == from_item_id),
            None,
        )
        if start_idx is None:
            return jsonify({"error": "Пункт не найден"}), 404

        group_item_ids = []
        for idx in range(start_idx, len(merged)):
            kind, el = merged[idx]
            if kind == "section" and idx != start_idx:
                break
            if kind == "item":
                group_item_ids.append(el["id"])

        section_pos = from_item["position"]
        cur = conn.execute(
            "INSERT INTO sections (task_id, title, position) VALUES (?, ?, ?)",
            (task_id, title, section_pos),
        )
        section_id = cur.lastrowid

        for item_id in group_item_ids:
            conn.execute(
                "UPDATE items SET section_id = ? WHERE id = ?",
                (section_id, item_id),
            )

        conn.commit()
        return jsonify(
            {"id": section_id, "title": title, "position": section_pos}
        ), 201


@app.route("/api/tasks/<int:task_id>/sections/ungroup-from", methods=["POST"])
def ungroup_from_item(task_id):
    data = request.get_json(silent=True) or {}
    from_item_id = data.get("from_item_id")

    if not isinstance(from_item_id, int):
        return jsonify({"error": "Нужен from_item_id"}), 400

    with get_db() as conn:
        task = conn.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if not task:
            return jsonify({"error": "Задача не найдена"}), 404

        items = fetch_items(conn, task_id)
        from_item = next((i for i in items if i["id"] == from_item_id), None)
        if not from_item:
            return jsonify({"error": "Пункт не найден"}), 404
        if not from_item["section_id"]:
            return jsonify({"error": "Пункт не в секции"}), 400

        section_id = from_item["section_id"]
        section_items = sorted(
            (i for i in items if i["section_id"] == section_id),
            key=lambda i: (i["position"], i["id"]),
        )
        start = next(
            (idx for idx, it in enumerate(section_items) if it["id"] == from_item_id),
            None,
        )
        if start is None:
            return jsonify({"error": "Пункт не найден"}), 404

        to_ungroup = section_items[start:]
        for item in to_ungroup:
            conn.execute(
                "UPDATE items SET section_id = NULL WHERE id = ?", (item["id"],)
            )

        items = fetch_items(conn, task_id)
        sections = fetch_sections(conn, task_id)
        apply_layout_positions(conn, task_id, items, sections)
        purge_empty_sections(conn, task_id)
        conn.commit()

    return jsonify({"ok": True})


@app.route("/api/sections/<int:section_id>", methods=["PATCH"])
def update_section(section_id):
    data = request.get_json(silent=True) or {}
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return jsonify({"error": "Название секции обязательно"}), 400

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, task_id, title, position FROM sections WHERE id = ?",
            (section_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Секция не найдена"}), 404

        new_title = title.strip()
        conn.execute(
            "UPDATE sections SET title = ? WHERE id = ?", (new_title, section_id)
        )
        conn.commit()
        return jsonify(
            {
                "id": section_id,
                "title": new_title,
                "position": row["position"],
            }
        )


@app.route("/api/sections/<int:section_id>", methods=["DELETE"])
def delete_section(section_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM sections WHERE id = ?", (section_id,)
        ).fetchone()
        if not row:
            return jsonify({"error": "Секция не найдена"}), 404

        conn.execute(
            "UPDATE items SET section_id = NULL WHERE section_id = ?", (section_id,)
        )
        conn.execute("DELETE FROM sections WHERE id = ?", (section_id,))
        conn.commit()
        return "", 204


@app.route("/api/items/<int:item_id>", methods=["PATCH"])
def update_item(item_id):
    data = request.get_json(silent=True) or {}

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, completed, position, section_id, task_id FROM items WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return jsonify({"error": "Пункт не найден"}), 404

        name = data.get("name")
        completed = data.get("completed")
        section_id = data.get("section_id")

        new_name = name.strip() if isinstance(name, str) and name.strip() else row["name"]
        new_completed = (
            int(bool(completed)) if completed is not None else row["completed"]
        )
        new_section_id = row["section_id"]
        new_position = row["position"]
        if "section_id" in data:
            new_section_id = int(section_id) if section_id else None
            if new_section_id:
                sec = conn.execute(
                    "SELECT id FROM sections WHERE id = ? AND task_id = ?",
                    (new_section_id, row["task_id"]),
                ).fetchone()
                if not sec:
                    return jsonify({"error": "Секция не найдена"}), 404
            elif row["section_id"]:
                max_item = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) AS p FROM items WHERE task_id = ?",
                    (row["task_id"],),
                ).fetchone()["p"]
                max_sec = conn.execute(
                    "SELECT COALESCE(MAX(position), -1) AS p FROM sections WHERE task_id = ?",
                    (row["task_id"],),
                ).fetchone()["p"]
                new_position = max(max_item, max_sec) + 1

        conn.execute(
            "UPDATE items SET name = ?, completed = ?, section_id = ?, position = ? WHERE id = ?",
            (new_name, new_completed, new_section_id, new_position, item_id),
        )
        conn.commit()

        return jsonify(
            {
                "id": item_id,
                "name": new_name,
                "completed": bool(new_completed),
                "position": new_position,
                "section_id": new_section_id,
            }
        )


@app.route("/api/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT task_id FROM items WHERE id = ?", (item_id,)
        ).fetchone()
        if not row:
            return jsonify({"error": "Пункт не найден"}), 404

        task_id = row["task_id"]
        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        purge_empty_sections(conn, task_id)
        conn.commit()
        return "", 204


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FastTodo")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="адрес привязки: 127.0.0.1 — только localhost (по умолчанию), "
        "0.0.0.0 — все интерфейсы",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5000,
        help="порт (по умолчанию 5000)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="включить режим отладки Flask (НЕ использовать на публичных адресах: "
        "Werkzeug debugger допускает выполнение произвольного кода)",
    )
    args = parser.parse_args()

    if args.debug and args.host not in ("127.0.0.1", "localhost", "::1"):
        parser.error(
            "--debug запрещён при привязке к публичному адресу "
            f"({args.host}): debug-консоль Werkzeug допускает RCE. "
            "Используйте --host 127.0.0.1 для отладки."
        )

    app.run(debug=args.debug, host=args.host, port=args.port)
