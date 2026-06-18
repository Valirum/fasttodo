import { THEME_KEY } from "../core/constants.js";
import { $, $$ } from "../core/dom.js";

function setThemePickerOpen(open) {
  const picker = $("#theme-picker");
  const btn = $("#theme-picker-btn");
  const menu = $("#theme-picker-menu");
  if (!picker || !btn || !menu) return;
  picker.classList.toggle("is-open", open);
  btn.setAttribute("aria-expanded", String(open));
  menu.hidden = !open;
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

export function initThemePicker() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);

  $("#theme-picker-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setThemePickerOpen(!$("#theme-picker")?.classList.contains("is-open"));
  });

  $$(".theme-picker-option").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      applyTheme(opt.dataset.theme);
      setThemePickerOpen(false);
    });
  });

  document.addEventListener("click", () => setThemePickerOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setThemePickerOpen(false);
  });
}
