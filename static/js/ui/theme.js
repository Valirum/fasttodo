import { api } from "../api/client.js";
import { ICON_PALETTE, THEME_KEY } from "../core/constants.js";
import { $, $$ } from "../core/dom.js";

let themes = [];

function setThemePickerOpen(open) {
  const picker = $("#theme-picker");
  const btn = $("#theme-picker-btn");
  const menu = $("#theme-picker-menu");
  if (!picker || !btn || !menu) return;
  picker.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", String(open));
  menu.hidden = !open;
}

export function closeThemePicker() {
  setThemePickerOpen(false);
}

function updateThemePickerActive(theme) {
  $$(".theme-picker-option").forEach((opt) => {
    const isActive = opt.dataset.theme === theme;
    opt.classList.toggle("active", isActive);
    opt.setAttribute("aria-selected", String(isActive));
  });
}

function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  updateThemePickerActive(name);
}

function resolveSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved && themes.some((t) => t.id === saved)) return saved;
  if (themes.some((t) => t.id === "dark")) return "dark";
  return themes[0]?.id ?? "dark";
}

function renderThemeMenu() {
  const menu = $("#theme-picker-menu");
  if (!menu) return;

  menu.innerHTML = "";
  for (const theme of themes) {
    const li = document.createElement("li");
    li.role = "option";
    li.className = "theme-picker-option";
    li.dataset.theme = theme.id;
    li.tabIndex = -1;

    if (theme.color) {
      li.dataset.color = "";
      li.style.setProperty("--theme-option-color", theme.color);
    }

    const label = document.createElement("span");
    label.className = "theme-picker-option-label";
    label.textContent = theme.name;
    li.appendChild(label);

    li.addEventListener("click", (e) => {
      e.stopPropagation();
      applyTheme(theme.id);
      setThemePickerOpen(false);
    });

    menu.appendChild(li);
  }
}

export async function initThemePicker() {
  themes = await api("/api/themes");
  renderThemeMenu();
  applyTheme(resolveSavedTheme());

  const btn = $("#theme-picker-btn");
  if (btn) btn.innerHTML = ICON_PALETTE;

  btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    setThemePickerOpen(!$("#theme-picker")?.classList.contains("is-open"));
  });

  if (btn) {
    new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) closeThemePicker();
      },
      { threshold: 0 }
    ).observe(btn);
  }

  document.addEventListener("click", () => setThemePickerOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setThemePickerOpen(false);
  });
}
