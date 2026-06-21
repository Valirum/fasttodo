import re
from pathlib import Path

THEMES_DIR = Path(__file__).parent / "static" / "css" / "themes"
THEME_META_RE = re.compile(
    r"/\*!\s*theme:\s*(.*?)(?:\s*\|\s*color:\s*([^*]+?))?\s*\*/",
    re.IGNORECASE,
)


def discover_themes():
    themes = []
    for path in sorted(THEMES_DIR.glob("*.css")):
        theme_id = path.stem
        head = path.read_text(encoding="utf-8")[:400]
        match = THEME_META_RE.search(head)
        name = theme_id
        color = None
        if match:
            raw_name = match.group(1).strip()
            if raw_name:
                name = raw_name
            if match.group(2):
                color = match.group(2).strip()
        themes.append({"id": theme_id, "name": name, "color": color})
    return themes


def themes_bundle_css():
    return "\n".join(
        f'@import url("/static/css/themes/{theme["id"]}.css");'
        for theme in discover_themes()
    )
