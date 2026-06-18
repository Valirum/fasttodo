import { api } from "../api/client.js";
import { $ } from "../core/dom.js";
import {
  state,
  editingTaskTitle,
  setEditingTaskTitle,
  getCurrentTask,
  getCurrentTaskIndex,
  setCurrentTaskId,
  resolveCurrentTaskIdAfterLoad,
} from "../core/state.js";
import { updateCurrentTaskProgressUI } from "../data/progress.js";

let renderApp = () => {};

export function bindRenderApp(fn) {
  renderApp = fn;
}

export async function loadTasks() {
  state.tasks = await api("/api/tasks");
  resolveCurrentTaskIdAfterLoad();
  renderApp();
}

export function reorderTasksLocally(orderIds) {
  const map = new Map(state.tasks.map((t) => [t.id, t]));
  state.tasks = orderIds.map((id) => map.get(id)).filter(Boolean);
}

export async function persistTaskOrder(orderIds) {
  await api("/api/tasks/reorder", {
    method: "PUT",
    body: JSON.stringify({ order: orderIds }),
  });
}

export function navigateTask(delta) {
  if (state.tasks.length <= 1) return;
  if (editingTaskTitle) finishEditTaskTitle(false);
  const idx = getCurrentTaskIndex();
  const currentIdx = idx >= 0 ? idx : 0;
  const nextIdx = (currentIdx + delta + state.tasks.length) % state.tasks.length;
  setCurrentTaskId(state.tasks[nextIdx].id);
  renderApp();
}

export async function createTask(title) {
  const task = await api("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  setCurrentTaskId(task.id);
  await loadTasks();
  const { switchView } = await import("../ui/render.js");
  switchView("current");
}

export async function deleteTask(taskId) {
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

export async function deleteCurrentTask() {
  if (!state.currentTaskId) return;
  await deleteTask(state.currentTaskId);
}

export async function renameTask(id, title) {
  await api(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
  await loadTasks();
}

export function startEditTaskTitle() {
  const task = getCurrentTask();
  if (!task) return;
  setEditingTaskTitle(true);
  $("#task-title").classList.add("hidden");
  const input = $("#task-title-input");
  input.classList.remove("hidden");
  input.value = task.title;
  input.focus();
  input.select();
}

export function finishEditTaskTitle(save) {
  if (!editingTaskTitle) return;
  setEditingTaskTitle(false);
  $("#task-title").classList.remove("hidden");
  const input = $("#task-title-input");
  input.classList.add("hidden");

  const task = getCurrentTask();
  if (!task) return;

  if (save) {
    const title = input.value.trim();
    if (title && title !== task.title) {
      renameTask(task.id, title);
      return;
    }
  }

  input.value = task.title;
  $("#task-title").textContent = task.title;
}
