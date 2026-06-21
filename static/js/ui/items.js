import { api } from "../api/client.js";
import { ICON_TRASH, EXPAND_DELAY_MS } from "../core/constants.js";
import { $, $$ } from "../core/dom.js";
import { state, getCurrentTask } from "../core/state.js";
import { updateCurrentTaskProgressUI, updateTaskProgress } from "../data/progress.js";
import { celebrateItemCheck, celebrateTaskComplete } from "./effects.js";
import {
  applyLayoutLocally,
  persistLayout,
  readLayoutFromDom,
  updateSectionBlocks,
} from "./sections.js";
import { handleItemDragMove, resolveItemDropTarget, setupPointerDrag } from "./drag-drop.js";
import { loadTasks } from "../data/tasks.js";

const expandTimers = new WeakMap();

async function refreshAllTasksList() {
  const { renderAllView } = await import("./render.js");
  renderAllView();
}

function getSingleLineLabelHeight() {
  return 20;
}

function measureLabelFullHeight(textarea) {
  const width = textarea.offsetWidth;
  if (!width) return getSingleLineLabelHeight();

  const clone = textarea.cloneNode(true);
  clone.value = textarea.value;
  clone.style.cssText = `
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    height: auto;
    max-height: none;
    width: ${width}px;
  `;
  document.body.appendChild(clone);
  const height = clone.scrollHeight;
  clone.remove();
  return height;
}

function clearExpandTimer(li) {
  const id = expandTimers.get(li);
  if (id) {
    clearTimeout(id);
    expandTimers.delete(li);
  }
}

function scheduleExpand(li) {
  clearExpandTimer(li);
  if (!li.classList.contains("can-expand")) return;
  const id = setTimeout(() => {
    expandTimers.delete(li);
    if (li.classList.contains("can-expand")) li.classList.add("is-open");
  }, EXPAND_DELAY_MS);
  expandTimers.set(li, id);
}

export function refreshItemLabelSizing(textarea) {
  const li = textarea.closest(".item");
  if (!li) return;
  const full = measureLabelFullHeight(textarea);
  const needs = full > getSingleLineLabelHeight() + 1;
  li.classList.toggle("can-expand", needs);
  if (needs) {
    textarea.style.setProperty("--label-max-height", `${full}px`);
  } else {
    textarea.style.removeProperty("--label-max-height");
    li.classList.remove("is-open");
    clearExpandTimer(li);
  }
}

function setupItemLabel(li, textarea, item) {
  refreshItemLabelSizing(textarea);

  li.addEventListener("mouseenter", () => scheduleExpand(li));
  li.addEventListener("mouseleave", () => {
    clearExpandTimer(li);
    if (document.activeElement !== textarea) li.classList.remove("is-open");
  });

  textarea.addEventListener("focus", () => {
    clearExpandTimer(li);
    if (li.classList.contains("can-expand")) li.classList.add("is-open");
  });
  textarea.addEventListener("input", () => {
    refreshItemLabelSizing(textarea);
    if (document.activeElement === textarea && li.classList.contains("can-expand")) {
      li.classList.add("is-open");
    }
  });
  textarea.addEventListener("blur", () => {
    if (textarea.value.trim() && textarea.value !== item.name) {
      renameItem(item.id, textarea.value.trim());
    } else {
      textarea.value = item.name;
    }
    refreshItemLabelSizing(textarea);
    clearExpandTimer(li);
    if (!li.matches(":hover")) li.classList.remove("is-open");
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });
}

export function createItemRow(item, { inSection = false } = {}) {
  const li = document.createElement("li");
  li.className = `item${item.completed ? " done" : ""}`;
  li.dataset.itemId = item.id;

  const groupBtn = inSection
    ? `<button type="button" class="btn-item-action btn-ungroup-item" title="Вынести этот и нижестоящие пункты из секции">Вынести</button>`
    : `<button type="button" class="btn-item-action btn-group-item" title="Сгруппировать с нижестоящими в секцию">Секция</button>`;

  li.innerHTML = `
    <input type="checkbox" class="item-checkbox" ${item.completed ? "checked" : ""}>
    <span class="item-drag-handle" title="Перетащить">⠿</span>
    <textarea class="item-label" rows="1"></textarea>
    ${groupBtn}
    <button type="button" class="btn-delete-item" title="Удалить">${ICON_TRASH}</button>
  `;

  const checkbox = li.querySelector(".item-checkbox");
  const label = li.querySelector(".item-label");
  label.value = item.name;

  checkbox.addEventListener("change", () => {
    const isChecked = checkbox.checked;
    if (isChecked) {
      li.classList.add("done");
      celebrateItemCheck(li, checkbox);
    } else {
      li.classList.remove("done");
    }
    toggleItem(item.id, isChecked);
  });

  li.querySelector(".btn-delete-item").addEventListener("click", () => deleteItem(item.id));

  if (inSection) {
    li.querySelector(".btn-ungroup-item").addEventListener("click", () => ungroupItem(item.id));
  } else {
    li.querySelector(".btn-group-item").addEventListener("click", () => createSectionFromItem(item.id));
  }

  setupItemLabel(li, label, item);
  return li;
}

function collapseItemForDrag(li) {
  clearExpandTimer(li);
  const label = li.querySelector(".item-label");
  const wasOpen = li.classList.contains("is-open");
  const wasFocused = document.activeElement === label;
  const collapsedForDrag =
    li.classList.contains("can-expand") && (wasOpen || wasFocused);

  if (collapsedForDrag) {
    li.classList.add("is-drag-collapsed");
    li.classList.remove("is-open");
    if (wasFocused) label.blur();
    void li.offsetHeight;
  }

  return { wasOpen, wasFocused, collapsedForDrag };
}

function restoreItemAfterDrag(li, { wasOpen, wasFocused, collapsedForDrag }) {
  li.classList.remove("is-drag-collapsed");
  if (!collapsedForDrag) return;

  const label = li.querySelector(".item-label");
  if (wasOpen && li.classList.contains("can-expand")) {
    li.classList.add("is-open");
  }
  if (wasFocused) label?.focus();
}

export function setupItemDrag(li, list) {
  const handle = li.querySelector(".item-drag-handle");
  const expandState = { wasOpen: false, wasFocused: false, collapsedForDrag: false };

  setupPointerDrag(li, handle, {
    listEl: list,
    itemSelector: ".item[data-item-id]",
    placeholderClass: "item drag-placeholder",
    draggingListClass: "is-item-dragging",
    resolveDrop: resolveItemDropTarget,
    onDragStart: () => {
      Object.assign(expandState, collapseItemForDrag(li));
    },
    onDragEnd: () => {
      restoreItemAfterDrag(li, expandState);
    },
    onReorder: async () => {
      const task = getCurrentTask();
      if (!task) return;

      const layout = readLayoutFromDom(list);
      applyLayoutLocally(task, layout);
      updateCurrentTaskProgressUI(task);
      updateSectionBlocks(task);
      refreshAllTasksList();

      try {
        await persistLayout(state.currentTaskId, layout);
      } catch {
        await loadTasks();
      }
    },
    onDragMove: (e, _li, dragState) => handleItemDragMove(e, list, dragState),
  });
}

export async function addItem(name, sectionId = null) {
  if (!state.currentTaskId) return;
  const body = { name };
  if (sectionId) body.section_id = sectionId;
  await api(`/api/tasks/${state.currentTaskId}/items`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  await loadTasks();
}

export async function createSectionFromItem(itemId) {
  if (!state.currentTaskId) return;
  await api(`/api/tasks/${state.currentTaskId}/sections`, {
    method: "POST",
    body: JSON.stringify({ from_item_id: itemId }),
  });
  await loadTasks();
}

export async function ungroupItem(itemId) {
  if (!state.currentTaskId) return;
  await api(`/api/tasks/${state.currentTaskId}/sections/ungroup-from`, {
    method: "POST",
    body: JSON.stringify({ from_item_id: itemId }),
  });
  await loadTasks();
}

export async function renameSection(sectionId, title) {
  await api(`/api/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  const task = getCurrentTask();
  const section = task?.sections?.find((s) => s.id === sectionId);
  if (section) section.title = title;
  refreshAllTasksList();
}

export async function toggleItem(id, completed) {
  const task = getCurrentTask();
  if (!task) return;

  const item = task.items.find((i) => i.id === id);
  if (!item) return;

  const wasAllDone = task.progress.percent === 100 && task.progress.total > 0;
  const prevCompleted = item.completed;

  item.completed = completed;
  updateTaskProgress(task);
  const shouldCelebrate =
    completed && !wasAllDone && task.progress.total > 0 && task.progress.percent === 100;
  updateCurrentTaskProgressUI(task, { animate: true, skipBump: shouldCelebrate });
  updateSectionBlocks(task);
  refreshAllTasksList();

  try {
    await api(`/api/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    });
    if (shouldCelebrate) celebrateTaskComplete();
  } catch {
    item.completed = prevCompleted;
    updateTaskProgress(task);
    updateCurrentTaskProgressUI(task);
    updateSectionBlocks(task);
    refreshAllTasksList();
    const li = document.querySelector(`[data-item-id="${id}"]`);
    if (li) {
      li.classList.toggle("done", prevCompleted);
      const checkbox = li.querySelector(".item-checkbox");
      if (checkbox) checkbox.checked = prevCompleted;
    }
  }
}

export async function renameItem(id, name) {
  await api(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  await loadTasks();
}

export async function deleteItem(id) {
  await api(`/api/items/${id}`, { method: "DELETE" });
  await loadTasks();
}
