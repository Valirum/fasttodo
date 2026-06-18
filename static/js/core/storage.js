import { COLLAPSED_SECTIONS_KEY, STORAGE_KEY } from "./constants.js";

export function loadStoredTaskId() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

export function saveCurrentTaskId(id) {
  if (id) {
    localStorage.setItem(STORAGE_KEY, String(id));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadCollapsedSections() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_SECTIONS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveCollapsedSection(sectionId, collapsed) {
  const set = loadCollapsedSections();
  if (collapsed) set.add(sectionId);
  else set.delete(sectionId);
  localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...set]));
}
