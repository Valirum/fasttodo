const STORAGE_KEY = "fasttodo:lastTaskId";

const state = {
  tasks: [],
  currentTaskId: null,
  view: "current",
  draggedTaskId: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

async function loadTasks() {
  state.tasks = await api("/api/tasks");

  const storedId = loadStoredTaskId();
  const hasStored = storedId && state.tasks.some((t) => t.id === storedId);

  if (hasStored) {
    state.currentTaskId = storedId;
  } else if (!state.currentTaskId && state.tasks.length) {
    state.currentTaskId = state.tasks[0].id;
  } else if (
    state.currentTaskId &&
    !state.tasks.find((t) => t.id === state.currentTaskId)
  ) {
    state.currentTaskId = state.tasks[0]?.id ?? null;
  }

  saveCurrentTaskId();
  render();
}

function loadStoredTaskId() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

function saveCurrentTaskId() {
  if (state.currentTaskId) {
    localStorage.setItem(STORAGE_KEY, String(state.currentTaskId));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setCurrentTaskId(id) {
  state.currentTaskId = id;
  saveCurrentTaskId();
}

function getCurrentTask() {
  return state.tasks.find((t) => t.id === state.currentTaskId) ?? null;
}

function render() {
  renderCurrentView();
  renderAllView();
}

function getCurrentTaskIndex() {
  return state.tasks.findIndex((t) => t.id === state.currentTaskId);
}

function navigateTask(delta) {
  if (state.tasks.length <= 1) return;
  const idx = getCurrentTaskIndex();
  const currentIdx = idx >= 0 ? idx : 0;
  const nextIdx = (currentIdx + delta + state.tasks.length) % state.tasks.length;
  setCurrentTaskId(state.tasks[nextIdx].id);
  render();
}

function updateTaskProgress(task) {
  const total = task.items.length;
  const done = task.items.filter((i) => i.completed).length;
  task.progress = {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function updateCurrentTaskProgressUI(task) {
  const { done, total, percent } = task.progress;
  $("#progress-label").textContent = `${done} из ${total}`;
  const percentEl = $("#progress-percent");
  percentEl.textContent = `${percent}%`;
  percentEl.classList.toggle("complete", percent === 100 && total > 0);

  const bar = $("#progress-bar");
  bar.style.width = `${percent}%`;
  bar.classList.toggle("complete", percent === 100 && total > 0);
}

function getSingleLineLabelHeight() {
  return 20;
}

function measureLabelHeight(textarea) {
  const prev = textarea.style.height;
  textarea.style.height = "auto";
  const height = textarea.scrollHeight;
  textarea.style.height = prev;
  return height;
}

function labelNeedsExpansion(textarea) {
  return measureLabelHeight(textarea) > getSingleLineLabelHeight() + 1;
}

function setItemLabelHeight(textarea, height) {
  textarea.style.height = `${height}px`;
}

function fitItemLabel(textarea) {
  setItemLabelHeight(textarea, measureLabelHeight(textarea));
}

function collapseItemLabel(textarea) {
  setItemLabelHeight(textarea, getSingleLineLabelHeight());
}

function updateItemLabelHeight(li, textarea) {
  const active = li.matches(":hover") || document.activeElement === textarea;
  const shouldExpand = active && labelNeedsExpansion(textarea);

  li.classList.toggle("is-expanded", shouldExpand);

  if (shouldExpand) {
    fitItemLabel(textarea);
  } else {
    collapseItemLabel(textarea);
  }
}

function setupItemLabel(li, textarea, item) {
  textarea.style.transition = "none";
  collapseItemLabel(textarea);
  requestAnimationFrame(() => {
    textarea.style.transition = "";
  });

  li.addEventListener("mouseenter", () => updateItemLabelHeight(li, textarea));
  li.addEventListener("mouseleave", () => updateItemLabelHeight(li, textarea));

  textarea.addEventListener("focus", () => updateItemLabelHeight(li, textarea));
  textarea.addEventListener("input", () => {
    if (document.activeElement === textarea) {
      updateItemLabelHeight(li, textarea);
    }
  });
  textarea.addEventListener("blur", () => {
    if (textarea.value.trim() && textarea.value !== item.name) {
      renameItem(item.id, textarea.value.trim());
    } else {
      textarea.value = item.name;
    }
    updateItemLabelHeight(li, textarea);
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });
}

function renderCurrentView({ rebuildItems = true } = {}) {
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

  $("#task-title").textContent = task.title;
  updateCurrentTaskProgressUI(task);

  if (!rebuildItems) return;

  const list = $("#items-list");
  list.innerHTML = "";
  task.items.forEach((item) => {
    const li = document.createElement("li");
    li.className = `item${item.completed ? " done" : ""}`;
    li.dataset.itemId = item.id;
    li.innerHTML = `
      <input type="checkbox" class="item-checkbox" ${item.completed ? "checked" : ""}>
      <textarea class="item-label" rows="1"></textarea>
      <button class="btn-delete-item" title="Удалить">✕</button>
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

    setupItemLabel(li, label, item);

    li.querySelector(".btn-delete-item").addEventListener("click", () => deleteItem(item.id));

    list.appendChild(li);
  });
}

function reorderTasksLocally(orderIds) {
  const map = new Map(state.tasks.map((t) => [t.id, t]));
  state.tasks = orderIds.map((id) => map.get(id)).filter(Boolean);
}

async function persistTaskOrder(orderIds) {
  await api("/api/tasks/reorder", {
    method: "PUT",
    body: JSON.stringify({ order: orderIds }),
  });
}

function renderAllView() {
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
    const li = document.createElement("li");
    li.className = "task-list-item";
    li.dataset.taskId = task.id;

    const card = document.createElement("div");
    card.className = `task-card${task.id === state.currentTaskId ? " active" : ""}`;

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
    deleteBtn.textContent = "✕";
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
        <div class="task-card-fill${percent === 100 && total > 0 ? " complete" : ""}" style="width:${percent}%"></div>
      </div>
      <span class="task-card-percent">${percent}%</span>
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
    li.appendChild(card);
    setupTaskDrag(li, handle, task.id);
    list.appendChild(li);
  });
}

function setupTaskDrag(li, handle, taskId) {
  let dragging = false;

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    state.draggedTaskId = taskId;
    li.classList.add("dragging");
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetLi = target?.closest(".task-list-item");
    $$(".task-list-item").forEach((item) => {
      item.classList.toggle("drag-over", item === targetLi && item !== li);
    });
  });

  const finishDrag = async (e) => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }
    li.classList.remove("dragging");

    const target = document.elementFromPoint(e.clientX, e.clientY);
    const targetLi = target?.closest(".task-list-item");
    $$(".task-list-item").forEach((item) => item.classList.remove("drag-over"));

    const draggedId = state.draggedTaskId;
    state.draggedTaskId = null;

    if (!targetLi || targetLi === li || !draggedId) return;

    const dropTaskId = Number(targetLi.dataset.taskId);
    if (!dropTaskId || dropTaskId === draggedId) return;

    const orderIds = state.tasks.map((t) => t.id);
    const fromIdx = orderIds.indexOf(draggedId);
    const toIdx = orderIds.indexOf(dropTaskId);
    if (fromIdx < 0 || toIdx < 0) return;

    orderIds.splice(fromIdx, 1);
    orderIds.splice(toIdx, 0, draggedId);

    reorderTasksLocally(orderIds);
    render();

    try {
      await persistTaskOrder(orderIds);
    } catch {
      await loadTasks();
    }
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function switchView(view) {
  state.view = view;
  $$(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  $$(".view").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${view}`);
  });
}

async function createTask(title) {
  const task = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  setCurrentTaskId(task.id);
  await loadTasks();
  switchView("current");
}

async function deleteTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  if (!confirm(`Удалить задачу «${task.title}» и все пункты?`)) return;

  const wasCurrent = state.currentTaskId === taskId;
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });

  if (wasCurrent) {
    const remaining = state.tasks.filter((t) => t.id !== taskId);
    setCurrentTaskId(remaining[0]?.id ?? null);
  }

  await loadTasks();
}

async function deleteCurrentTask() {
  if (!state.currentTaskId) return;
  await deleteTask(state.currentTaskId);
}

async function addItem(name) {
  if (!state.currentTaskId) return;
  await api(`/api/tasks/${state.currentTaskId}/items`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  await loadTasks();
}

async function toggleItem(id, completed) {
  const task = getCurrentTask();
  if (!task) return;

  const item = task.items.find((i) => i.id === id);
  if (!item) return;

  const wasAllDone = task.progress.percent === 100 && task.progress.total > 0;
  const prevCompleted = item.completed;

  item.completed = completed;
  updateTaskProgress(task);
  updateCurrentTaskProgressUI(task);
  renderAllView();

  const shouldCelebrate =
    completed && !wasAllDone && task.progress.total > 0 && task.progress.percent === 100;

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
    renderAllView();
    const li = document.querySelector(`[data-item-id="${id}"]`);
    if (li) {
      li.classList.toggle("done", prevCompleted);
      const checkbox = li.querySelector(".item-checkbox");
      if (checkbox) checkbox.checked = prevCompleted;
    }
  }
}

function celebrateItemCheck(li, checkbox) {
  checkbox.classList.remove("check-pop");
  li.classList.remove("item-celebrate");
  void checkbox.offsetWidth;
  checkbox.classList.add("check-pop");
  li.classList.add("item-celebrate");
  spawnSparkles(checkbox);
  checkbox.addEventListener(
    "animationend",
    () => checkbox.classList.remove("check-pop"),
    { once: true }
  );
  li.addEventListener("animationend", () => li.classList.remove("item-celebrate"), {
    once: true,
  });
}

function spawnSparkles(anchor) {
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = ["#00cec9", "#55efc4", "#a29bfe", "#fdcb6e", "#ffeaa7"];

  for (let i = 0; i < 10; i++) {
    const p = document.createElement("span");
    p.className = "sparkle";
    const angle = (Math.PI * 2 * i) / 10 + (Math.random() - 0.5) * 0.4;
    const dist = 18 + Math.random() * 22;
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    p.style.background = colors[i % colors.length];
    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove(), { once: true });
  }
}

function celebrateTaskComplete() {
  spawnConfetti($(".progress-track"));

  $("#progress-bar")?.classList.add("progress-complete-pulse");
  $(".progress-track")?.classList.add("progress-complete-burst");
  $("#progress-percent")?.classList.add("progress-complete-pop");
  $("#task-title")?.classList.add("task-complete-glow");

  const toast = document.createElement("div");
  toast.className = "complete-toast";
  toast.textContent = "Задача выполнена!";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);

  setTimeout(() => {
    $("#progress-bar")?.classList.remove("progress-complete-pulse");
    $(".progress-track")?.classList.remove("progress-complete-burst");
    $("#progress-percent")?.classList.remove("progress-complete-pop");
    $("#task-title")?.classList.remove("task-complete-glow");
  }, 1600);
}

function spawnConfetti(anchor) {
  const rect = anchor?.getBoundingClientRect() ?? {
    left: window.innerWidth / 2,
    top: window.innerHeight / 3,
    width: 200,
    height: 10,
  };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = [
    "#00cec9",
    "#55efc4",
    "#a29bfe",
    "#6c5ce7",
    "#fdcb6e",
    "#ffeaa7",
    "#ff7675",
  ];

  for (let i = 0; i < 48; i++) {
    const el = document.createElement("span");
    el.className = "confetti";
    const dx = (Math.random() - 0.5) * 320;
    const dy = 60 + Math.random() * 260;
    el.style.left = `${cx + (Math.random() - 0.5) * rect.width}px`;
    el.style.top = `${cy}px`;
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    el.style.setProperty("--duration", `${0.9 + Math.random() * 0.7}s`);
    el.style.background = colors[i % colors.length];
    if (Math.random() > 0.45) el.style.borderRadius = "50%";
    if (Math.random() > 0.7) {
      el.style.width = `${5 + Math.random() * 4}px`;
      el.style.height = `${12 + Math.random() * 8}px`;
    }
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

async function renameItem(id, name) {
  await api(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  await loadTasks();
}

async function deleteItem(id) {
  await api(`/api/items/${id}`, { method: "DELETE" });
  await loadTasks();
}

// Events
$$(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchView(btn.dataset.view);
    if (btn.dataset.view === "current") renderCurrentView();
  });
});

$("#form-new-task").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#task-name");
  const title = input.value.trim();
  if (!title) return;
  await createTask(title);
  input.value = "";
});

$("#form-add-item").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#item-name");
  const name = input.value.trim();
  await addItem(name);
  input.value = "";
  input.focus();
});

$("#btn-delete-task").addEventListener("click", deleteCurrentTask);
$("#btn-prev-task").addEventListener("click", () => navigateTask(-1));
$("#btn-next-task").addEventListener("click", () => navigateTask(1));

loadTasks();
