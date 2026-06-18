import { state, getCurrentTask } from "../core/state.js";
import { updateCurrentTaskProgressUI } from "../data/progress.js";
import { loadTasks } from "../data/tasks.js";
import {
  applyLayoutLocally,
  persistLayout,
  readLayoutFromDom,
  setSectionToggleIcon,
  updateSectionBlocks,
} from "./sections.js";
import { resolveSectionDropTarget, setupPointerDrag } from "./drag-drop.js";

function getRootListChildren(list) {
  return [...list.children].filter(
    (el) =>
      el.classList.contains("section-block") ||
      (el.classList.contains("item") && el.dataset.itemId)
  );
}

async function refreshAllTasksList() {
  const { renderAllView } = await import("./render.js");
  renderAllView();
}

export function setupSectionDrag(block, list) {
  const handle = block.querySelector(".section-drag-handle");
  if (!handle) return;

  const collapseState = { wasCollapsed: false, collapsedForDrag: false };

  setupPointerDrag(block, handle, {
    listEl: list,
    getChildren: () => getRootListChildren(list),
    placeholderClass: "section-block section-drag-placeholder",
    measureEl: ".section-header",
    draggingListClass: "is-section-dragging",
    getId: (el) => Number(el.dataset.sectionId),
    resolveDrop: resolveSectionDropTarget,
    onDragStart: () => {
      const toggleBtn = block.querySelector(".section-toggle-btn");
      collapseState.wasCollapsed = block.classList.contains("is-collapsed");
      collapseState.collapsedForDrag = !collapseState.wasCollapsed;
      if (collapseState.collapsedForDrag) {
        block.classList.add("is-collapsed");
        setSectionToggleIcon(toggleBtn, true);
      }
    },
    onDragEnd: () => {
      if (!collapseState.collapsedForDrag) return;
      const toggleBtn = block.querySelector(".section-toggle-btn");
      block.classList.remove("is-collapsed");
      setSectionToggleIcon(toggleBtn, false);
    },
    onReorder: async () => {
      const task = getCurrentTask();
      if (!task) return;

      const layout = readLayoutFromDom(list);
      applyLayoutLocally(task, layout);
      updateCurrentTaskProgressUI(task);
      updateSectionBlocks(task);
      await refreshAllTasksList();

      try {
        await persistLayout(state.currentTaskId, layout);
      } catch {
        await loadTasks();
      }
    },
  });
}
