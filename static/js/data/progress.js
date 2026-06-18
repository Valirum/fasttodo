import { $ } from "../core/dom.js";

let displayedFillPercent = null;
let displayedPercent = null;
let percentAnimFrame = null;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function updateTaskProgress(task) {
  const total = task.items.length;
  const done = task.items.filter((i) => i.completed).length;
  const exactPercent = total ? (done / total) * 100 : 0;
  task.progress = {
    done,
    total,
    percent: Math.round(exactPercent),
    exactPercent,
  };
}

function readBarWidthPercent(bar) {
  const match = bar.style.width.match(/^([\d.]+)%$/);
  if (match) return parseFloat(match[1]);
  const track = bar.parentElement;
  if (!track?.offsetWidth) return 0;
  return (bar.offsetWidth / track.offsetWidth) * 100;
}

function bumpProgressTrack(track, { skip = false } = {}) {
  if (!track || skip) return;
  track.classList.remove("progress-track-bump");
  void track.offsetWidth;
  track.classList.add("progress-track-bump");
  track.addEventListener(
    "animationend",
    () => track.classList.remove("progress-track-bump"),
    { once: true }
  );
}

function animatePercentCounter(el, from, to) {
  if (percentAnimFrame) cancelAnimationFrame(percentAnimFrame);
  if (from === to) {
    el.textContent = `${to}%`;
    return;
  }

  const duration = 420;
  const start = performance.now();

  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${Math.round(from + (to - from) * eased)}%`;
    if (t < 1) {
      percentAnimFrame = requestAnimationFrame(step);
    } else {
      el.textContent = `${to}%`;
      percentAnimFrame = null;
    }
  };

  percentAnimFrame = requestAnimationFrame(step);
}

function animateBarWidth(bar, to) {
  const fromFill = displayedFillPercent ?? readBarWidthPercent(bar);
  const growing = to > fromFill + 0.0001;
  bar.style.transition = growing
    ? "width 0.48s cubic-bezier(0.33, 1.12, 0.45, 1)"
    : "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
  bar.style.width = `${to}%`;

  bar.addEventListener(
    "transitionend",
    () => {
      displayedFillPercent = to;
    },
    { once: true }
  );
}

export function updateCurrentTaskProgressUI(task, { animate = false, skipBump = false } = {}) {
  updateTaskProgress(task);

  const { percent, exactPercent } = task.progress;
  $("#progress-label").textContent = `${task.progress.done} из ${task.progress.total}`;

  const percentEl = $("#progress-percent");
  const bar = $("#progress-bar");
  const track = $(".progress-track");
  if (!bar) return;

  const isComplete = percent === 100 && task.progress.total > 0;

  percentEl.classList.toggle("complete", isComplete);
  bar.classList.toggle("complete", isComplete);

  const fromFill = displayedFillPercent ?? readBarWidthPercent(bar);
  const fromLabel = displayedPercent ?? percent;
  const fillChanged = Math.abs(fromFill - exactPercent) > 0.0001;
  const labelChanged = fromLabel !== percent;
  const shouldAnimate =
    animate && !prefersReducedMotion() && (fillChanged || labelChanged);

  if (!shouldAnimate) {
    displayedFillPercent = exactPercent;
    displayedPercent = percent;
    percentEl.textContent = `${percent}%`;
    bar.style.transition = "";
    bar.style.width = `${exactPercent}%`;
    return;
  }

  bumpProgressTrack(track, { skip: skipBump });

  if (labelChanged) {
    animatePercentCounter(percentEl, fromLabel, percent);
  } else {
    percentEl.textContent = `${percent}%`;
  }

  if (fillChanged) {
    animateBarWidth(bar, exactPercent);
  } else {
    displayedFillPercent = exactPercent;
  }

  displayedPercent = percent;
}
