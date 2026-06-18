import { $, $$ } from "./core/dom.js";
import {
  bindRenderApp,
  createTask,
  deleteCurrentTask,
  finishEditTaskTitle,
  loadTasks,
  navigateTask,
  startEditTaskTitle,
} from "./data/tasks.js";
import { addItem } from "./ui/items.js";
import { render, renderCurrentView, switchView } from "./ui/render.js";
import { initThemePicker } from "./ui/theme.js";

bindRenderApp(render);

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
$("#btn-edit-task").addEventListener("click", startEditTaskTitle);
$("#task-title-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    finishEditTaskTitle(true);
  } else if (e.key === "Escape") {
    e.preventDefault();
    finishEditTaskTitle(false);
  }
});
$("#task-title-input").addEventListener("blur", () => finishEditTaskTitle(true));
$("#btn-prev-task").addEventListener("click", () => navigateTask(-1));
$("#btn-next-task").addEventListener("click", () => navigateTask(1));

initThemePicker();
loadTasks();
