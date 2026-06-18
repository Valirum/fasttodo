import { $ } from "../core/dom.js";

export function celebrateItemCheck(li, checkbox) {
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

export function celebrateTaskComplete() {
  setTimeout(() => spawnConfetti($(".progress-track")), 420);

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
