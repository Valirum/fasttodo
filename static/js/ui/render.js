import { ICON_TRASH } from "../core/constants.js";
import { $, $$ } from "../core/dom.js";
import {
  state,
  editingTaskTitle,
  getCurrentTask,
  getCurrentTaskIndex,
  setCurrentTaskId,
} from "../core/state.js";
import { updateCurrentTaskProgressUI } from "../data/progress.js";
import {
  deleteTask,
  loadTasks,
  persistTaskOrder,
  reorderTasksLocally,
} from "../data/tasks.js";
import { setupSectionDrag } from "./section-drag.js";
import {
  addItem,
  createItemRow,
  refreshItemLabelSizing,
  renameSection,
  setupItemDrag,
} from "./items.js";
import {
  buildDisplayBlocks,
  renderSectionBlock,
} from "./sections.js";
import {
  computeReorderedIds,
  resolveTaskDropTarget,
  setupPointerDrag,
} from "./drag-drop.js";

export function switchView(view) {
  state.view = view;
  $$(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  $$(".view").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${view}`);
  });
}

export function render() {
  renderCurrentView();
  renderAllView();
}

export function renderCurrentView({ rebuildItems = true } = {}) {
  const task = getCurrentTask();
  const noTask = $("#no-task");
  const detail = $("#task-detail");

  if (!task) {
    noTask.classList.remove("hidden");
    detail.classList.add("hidden");
    return;
  }

  noTask.classList.add("hidden");
  detail.classList.remove("hidden");

  const idx = getCurrentTaskIndex();
  const nav = $("#task-nav");
  const n = state.tasks.length;
  if (n > 1) {
    nav.classList.remove("hidden");
    const prevTask = state.tasks[(idx - 1 + n) % n];
    const nextTask = state.tasks[(idx + 1) % n];
    $("#task-nav-prev-title").textContent = prevTask.title;
    $("#task-nav-next-title").textContent = nextTask.title;
    $("#btn-prev-task").title = prevTask.title;
    $("#btn-next-task").title = nextTask.title;
  } else {
    nav.classList.add("hidden");
  }

  if (!editingTaskTitle) {
    $("#task-title").textContent = task.title;
    $("#task-title-input").value = task.title;
  }
  updateCurrentTaskProgressUI(task);

  if (!rebuildItems) return;

  const list = $("#items-list");
  list.innerHTML = "";

  const sectionDeps = { createItemRow, setupItemDrag, setupSectionDrag, addItem, renameSection };

  buildDisplayBlocks(task).forEach((block) => {
    if (block.type === "loose") {
      block.items.forEach((item) => {
        const row = createItemRow(item, { inSection: false });
        list.appendChild(row);
        setupItemDrag(row, list);
      });
    } else if (block.type === "section") {
      renderSectionBlock(block.section, block.items, list, sectionDeps);
    }
  });

  requestAnimationFrame(() => {
    $$("#items-list .item-label").forEach(refreshItemLabelSizing);
  });
}

export function renderAllView() {
  const list = $("#tasks-list");
  const empty = $("#all-empty");

  if (!state.tasks.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = "";

  state.tasks.forEach((task) => {
    const { done, total, percent } = task.progress;
    const isComplete = percent === 100 && total > 0;
    const li = document.createElement("li");
    li.className = "task-list-item";
    li.dataset.taskId = task.id;

    const card = document.createElement("div");
    card.className = `task-card${task.id === state.currentTaskId ? " active" : ""}${isComplete ? " is-complete" : ""}`;

    const handle = document.createElement("span");
    handle.className = "task-drag-handle";
    handle.title = "Перетащить";
    handle.textContent = "⠿";

    const body = document.createElement("div");
    body.className = "task-card-body";

    const title = document.createElement("div");
    title.className = "task-card-title";
    title.textContent = task.title;

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-delete-item";
    deleteBtn.title = "Удалить";
    deleteBtn.innerHTML = ICON_TRASH;
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    const progressRow = document.createElement("div");
    progressRow.className = "task-card-progress-row";

    const progress = document.createElement("div");
    progress.className = "task-card-progress";
    progress.innerHTML = `
      <div class="task-card-track">
        <div class="task-card-fill${isComplete ? " complete" : ""}" style="width:${percent}%"></div>
      </div>
      <span class="task-card-percent${isComplete ? " is-done" : ""}">${percent}%</span>
    `;

    progressRow.appendChild(progress);
    progressRow.appendChild(deleteBtn);

    const meta = document.createElement("div");
    meta.className = "task-card-meta";
    meta.textContent = `${done} / ${total} пунктов`;

    body.appendChild(title);
    body.appendChild(progressRow);
    body.appendChild(meta);

    body.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete-item")) return;
      setCurrentTaskId(task.id);
      render();
      switchView("current");
    });

    card.appendChild(handle);
    card.appendChild(body);
    if (isComplete) {
      const ribbon = document.createElement("span");
      ribbon.className = "task-card-ribbon";
      ribbon.setAttribute("aria-hidden", "true");
      ribbon.textContent = "Готово";
      card.appendChild(ribbon);
    }
    li.appendChild(card);
    setupPointerDrag(li, handle, {
      listEl: list,
      itemSelector: ".task-list-item",
      placeholderClass: "task-drag-placeholder",
      measureEl: ".task-card",
      resolveDrop: (draggedLi, _x, clientY, flatItems, root) =>
        resolveTaskDropTarget(draggedLi, clientY, flatItems, root),
      getId: (el) => Number(el.dataset.taskId),
      onReorder: async (draggedId, insertBefore, children, draggedLi) => {
        const orderIds = state.tasks.map((t) => t.id);
        const newOrder = computeReorderedIds(
          orderIds,
          draggedId,
          insertBefore,
          children,
          draggedLi
        );
        if (!newOrder) return;

        reorderTasksLocally(newOrder);
        render();

        try {
          await persistTaskOrder(newOrder);
        } catch {
          await loadTasks();
        }
      },
    });
    list.appendChild(li);
  });
}
