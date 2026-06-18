import { loadStoredTaskId, saveCurrentTaskId } from "./storage.js";

export const state = {
  tasks: [],
  currentTaskId: null,
  view: "current",
};

export let editingTaskTitle = false;

export function setEditingTaskTitle(value) {
  editingTaskTitle = value;
}

export function getCurrentTask() {
  return state.tasks.find((t) => t.id === state.currentTaskId) ?? null;
}

export function getCurrentTaskIndex() {
  return state.tasks.findIndex((t) => t.id === state.currentTaskId);
}

export function setCurrentTaskId(id) {
  state.currentTaskId = id;
  saveCurrentTaskId(id);
}

export function resolveCurrentTaskIdAfterLoad() {
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

  saveCurrentTaskId(state.currentTaskId);
}
