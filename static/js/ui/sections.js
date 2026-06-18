import { api } from "../api/client.js";
import {
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_RIGHT,
  EXPAND_DELAY_MS,
} from "../core/constants.js";
import { $, $$ } from "../core/dom.js";
import { loadCollapsedSections, saveCollapsedSection } from "../core/storage.js";
import { updateTaskProgress } from "../data/progress.js";

const sectionExpandTimers = new WeakMap();

export function buildDisplayBlocks(task) {
  const sections = task.sections || [];
  const elements = [
    ...sections.map((s) => ({ type: "section", ...s })),
    ...task.items.map((i) => ({ type: "item", ...i })),
  ].sort(
    (a, b) => a.position - b.position || (a.type === "section" ? -1 : 1)
  );

  const blocks = [];
  let loose = [];
  let openSection = null;
  let sectionItems = [];

  const flushLoose = () => {
    if (loose.length) {
      blocks.push({ type: "loose", items: loose });
      loose = [];
    }
  };

  const flushSection = () => {
    if (openSection) {
      if (sectionItems.length) {
        blocks.push({ type: "section", section: openSection, items: sectionItems });
      }
      openSection = null;
      sectionItems = [];
    }
  };

  for (const el of elements) {
    if (el.type === "item" && !el.section_id) {
      flushSection();
      loose.push(el);
    } else if (el.type === "section") {
      flushLoose();
      flushSection();
      openSection = { id: el.id, title: el.title, position: el.position };
    } else if (el.type === "item" && el.section_id) {
      if (openSection && openSection.id === el.section_id) {
        sectionItems.push(el);
      } else {
        flushSection();
        loose.push(el);
      }
    }
  }

  flushLoose();
  flushSection();
  return blocks;
}

export function sectionProgress(items) {
  const total = items.length;
  const done = items.filter((i) => i.completed).length;
  return { done, total };
}

export function clearSectionExpandTimer(block) {
  const id = sectionExpandTimers.get(block);
  if (id) {
    clearTimeout(id);
    sectionExpandTimers.delete(block);
  }
}

export function scheduleSectionExpand(block) {
  clearSectionExpandTimer(block);
  if (!block?.classList.contains("is-collapsed")) return;
  const id = setTimeout(() => {
    sectionExpandTimers.delete(block);
    block.classList.remove("is-collapsed");
    setSectionToggleIcon(block.querySelector(".section-toggle-btn"), false);
    saveCollapsedSection(Number(block.dataset.sectionId), false);
  }, EXPAND_DELAY_MS);
  sectionExpandTimers.set(block, id);
}

export function clearAllSectionExpandTimers() {
  $$(".section-block").forEach(clearSectionExpandTimer);
}

export function updateSectionBlocks(task) {
  $$(".section-block").forEach((block) => {
    const sid = Number(block.dataset.sectionId);
    const items = task.items.filter((i) => i.section_id === sid);
    const { done, total } = sectionProgress(items);
    const countEl = block.querySelector(".section-count");
    if (countEl) countEl.textContent = `${done}/${total}`;
    block.classList.toggle("is-complete", total > 0 && done === total);
  });
}

function removeEmptySectionBlocks(root) {
  root.querySelectorAll(".section-block").forEach((block) => {
    const count = block.querySelectorAll(":scope > .section-items > .item").length;
    if (!count) block.remove();
  });
}

export function readLayoutFromDom(root) {
  removeEmptySectionBlocks(root);
  const items = [];
  const sections = [];
  let pos = 0;

  for (const child of root.children) {
    if (child.classList.contains("item")) {
      items.push({
        id: Number(child.dataset.itemId),
        position: pos++,
        section_id: null,
      });
    } else if (child.classList.contains("section-block")) {
      const sectionItems = child.querySelectorAll(":scope > .section-items > .item");
      if (!sectionItems.length) continue;

      const sid = Number(child.dataset.sectionId);
      const title = child.querySelector(".section-title")?.value.trim() || "";
      sections.push({ id: sid, position: pos++, title });
      for (const itemEl of sectionItems) {
        items.push({
          id: Number(itemEl.dataset.itemId),
          position: pos++,
          section_id: sid,
        });
      }
    }
  }

  return { items, sections };
}

export function applyLayoutLocally(task, layout) {
  const itemMap = new Map(task.items.map((i) => [i.id, { ...i }]));
  task.items = layout.items
    .map((entry) => {
      const item = itemMap.get(entry.id);
      if (!item) return null;
      item.position = entry.position;
      item.section_id = entry.section_id;
      return item;
    })
    .filter(Boolean);

  const sectionMap = new Map((task.sections || []).map((s) => [s.id, { ...s }]));
  task.sections = layout.sections
    .map((entry) => {
      const section = sectionMap.get(entry.id);
      if (!section) return null;
      section.position = entry.position;
      section.title = entry.title;
      return section;
    })
    .filter(Boolean);

  updateTaskProgress(task);
}

export async function persistLayout(taskId, layout) {
  await api(`/api/tasks/${taskId}/layout`, {
    method: "PUT",
    body: JSON.stringify(layout),
  });
}

export function setSectionToggleIcon(btn, collapsed) {
  btn.innerHTML = collapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
  btn.setAttribute("aria-expanded", String(!collapsed));
}

export function renderSectionBlock(section, items, list, {
  createItemRow,
  setupItemDrag,
  setupSectionDrag,
  addItem,
  renameSection,
}) {
  const { done, total } = sectionProgress(items);
  const collapsed = loadCollapsedSections().has(section.id);
  const block = document.createElement("li");
  block.className = "section-block";
  if (total > 0 && done === total) block.classList.add("is-complete");
  if (collapsed) block.classList.add("is-collapsed");
  block.dataset.sectionId = section.id;

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
    <button type="button" class="section-toggle-btn" aria-expanded="${!collapsed}" title="Свернуть / развернуть"></button>
    <span class="section-drag-handle" title="Перетащить секцию">⠿</span>
    <input type="text" class="section-title" aria-label="Название секции" maxlength="120">
    <span class="section-count">${done}/${total}</span>
    <button type="button" class="section-add-btn" title="Добавить пункт в секцию">+</button>
  `;

  const toggleBtn = header.querySelector(".section-toggle-btn");
  setSectionToggleIcon(toggleBtn, collapsed);
  toggleBtn.addEventListener("click", () => {
    const isCollapsed = block.classList.toggle("is-collapsed");
    setSectionToggleIcon(toggleBtn, isCollapsed);
    saveCollapsedSection(section.id, isCollapsed);
  });

  const titleInput = header.querySelector(".section-title");
  titleInput.value = section.title;
  titleInput.addEventListener("blur", () => {
    const title = titleInput.value.trim();
    if (title && title !== section.title) renameSection(section.id, title);
    else titleInput.value = section.title;
  });
  titleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      titleInput.blur();
    }
  });

  const itemsUl = document.createElement("ul");
  itemsUl.className = "section-items";
  items.forEach((item) => {
    const row = createItemRow(item, { inSection: true });
    itemsUl.appendChild(row);
    setupItemDrag(row, list);
  });

  const addInline = document.createElement("div");
  addInline.className = "section-add-inline";
  addInline.innerHTML = `
    <input type="text" placeholder="Новый пункт..." aria-label="Пункт секции">
    <button type="button" class="btn-primary">Добавить</button>
  `;

  const addInput = addInline.querySelector("input");
  const submitAdd = async () => {
    const name = addInput.value.trim();
    await addItem(name, section.id);
    addInput.value = "";
    addInline.classList.remove("is-open");
  };

  addInline.querySelector(".btn-primary").addEventListener("click", submitAdd);
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitAdd();
    } else if (e.key === "Escape") {
      addInline.classList.remove("is-open");
      addInput.value = "";
    }
  });

  header.querySelector(".section-add-btn").addEventListener("click", () => {
    addInline.classList.toggle("is-open");
    if (addInline.classList.contains("is-open")) addInput.focus();
  });

  const footer = document.createElement("div");
  footer.className = "section-footer";

  block.appendChild(header);
  block.appendChild(itemsUl);
  block.appendChild(addInline);
  block.appendChild(footer);
  list.appendChild(block);
  setupSectionDrag?.(block, list);
}
