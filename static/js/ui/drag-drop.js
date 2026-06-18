import { $, $$ } from "../core/dom.js";
import { EXPAND_DELAY_MS } from "../core/constants.js";
import {
  clearAllSectionExpandTimers,
  clearSectionExpandTimer,
  scheduleSectionExpand,
} from "./sections.js";

export function getInsertBeforeIndex(children, draggedLi, clientY) {
  let insertBefore = children.length;
  for (let i = 0; i < children.length; i++) {
    const { top, height } = children[i].getBoundingClientRect();
    if (clientY < top + height / 2) {
      insertBefore = i;
      break;
    }
  }
  return insertBefore;
}

export function computeReorderedIds(orderIds, draggedId, insertBefore, children, draggedLi) {
  const fromIndex = children.indexOf(draggedLi);
  let toIndex = insertBefore;
  if (fromIndex !== -1 && fromIndex < toIndex) toIndex--;

  const fromOrderIdx = orderIds.indexOf(draggedId);
  if (fromOrderIdx < 0) return null;
  if (fromOrderIdx === toIndex) return null;

  const next = [...orderIds];
  next.splice(fromOrderIdx, 1);
  next.splice(toIndex, 0, draggedId);
  return next;
}

const SECTION_BOUNDARY_BAND = 20;
const SECTION_BOUNDARY_HYSTERESIS = 8;

function isBetweenAtSeam(clientY, seam, dragState, pairKey) {
  const prev = dragState?.betweenPairs?.get(pairKey);
  const band =
    prev === true
      ? SECTION_BOUNDARY_BAND + SECTION_BOUNDARY_HYSTERESIS
      : prev === false
        ? SECTION_BOUNDARY_BAND - SECTION_BOUNDARY_HYSTERESIS
        : SECTION_BOUNDARY_BAND;
  return Math.abs(clientY - seam) <= band;
}

function resolveSectionPairBoundary(listEl, clientY, dragState) {
  if (!listEl) return null;

  const children = [...listEl.children];
  for (let i = 0; i < children.length - 1; i++) {
    const upper = children[i];
    const lower = children[i + 1];
    if (!upper.classList.contains("section-block") || !lower.classList.contains("section-block")) {
      continue;
    }

    const upperRect = upper.getBoundingClientRect();
    const lowerRect = lower.getBoundingClientRect();
    const seam = (upperRect.bottom + lowerRect.top) / 2;

    const lowerHeader = lower.querySelector(".section-header");
    const upperFooter = upper.querySelector(".section-footer");
    const headerRect = lowerHeader?.getBoundingClientRect();
    const footerRect = upperFooter?.getBoundingClientRect();

    const bandTop = footerRect?.top ?? upperRect.bottom - 6;
    const bandBottom = headerRect?.bottom ?? lowerRect.top + 36;

    if (clientY < bandTop || clientY > bandBottom) continue;

    const pairKey = `${upper.dataset.sectionId}-${lower.dataset.sectionId}`;
    const between = isBetweenAtSeam(clientY, seam, dragState, pairKey);
    dragState?.betweenPairs?.set(pairKey, between);

    if (between) {
      return { parent: listEl, before: lower };
    }

    if (clientY < seam) {
      const itemsUl = upper.querySelector(".section-items");
      if (itemsUl) return { parent: itemsUl, before: null };
    }

    const itemsUl = lower.querySelector(".section-items");
    if (itemsUl) {
      const first = itemsUl.querySelector(":scope > .item[data-item-id]");
      return { parent: itemsUl, before: first };
    }
  }

  return null;
}

function resolveFlatItemTarget(draggedLi, insertBefore, flatItems, clientY, listEl) {
  const target = flatItems[insertBefore];

  if (target && target !== draggedLi) {
    if (
      listEl &&
      target.parentElement === listEl &&
      target.previousElementSibling?.classList?.contains("section-block")
    ) {
      const itemsUl = target.previousElementSibling.querySelector(".section-items");
      const sectionItems = [...itemsUl.querySelectorAll(":scope > .item[data-item-id]")].filter(
        (el) => el !== draggedLi
      );
      const last = sectionItems.at(-1);
      if (!last || clientY >= last.getBoundingClientRect().top + last.getBoundingClientRect().height / 2) {
        return { parent: itemsUl, before: null };
      }
    }
    return { parent: target.parentElement, before: target };
  }

  const others = flatItems.filter((el) => el !== draggedLi);
  const last = others.at(-1);
  if (last) return { parent: last.parentElement, before: null };
  return { parent: listEl || $("#items-list"), before: null };
}

export function resolveItemDropTarget(draggedLi, clientX, clientY, flatItems, listEl, dragState) {
  const boundary = resolveSectionPairBoundary(listEl, clientY, dragState);
  if (boundary) return boundary;

  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit) {
    return resolveFlatItemTarget(
      draggedLi,
      getInsertBeforeIndex(flatItems, draggedLi, clientY),
      flatItems,
      clientY,
      listEl
    );
  }

  const hitItem = hit.closest(".item[data-item-id]");
  if (hitItem && hitItem !== draggedLi) {
    const rect = hitItem.getBoundingClientRect();
    const parent = hitItem.parentElement;
    if (clientY < rect.top + rect.height / 2) {
      return { parent, before: hitItem };
    }
    return { parent, before: hitItem.nextElementSibling };
  }

  const sectionBlock = hit.closest(".section-block");
  if (sectionBlock && (hit.closest(".section-header") || hit.closest(".section-footer"))) {
    const prevIsSection = sectionBlock.previousElementSibling?.classList.contains("section-block");
    const nextIsSection = sectionBlock.nextElementSibling?.classList.contains("section-block");
    if (!prevIsSection && !nextIsSection) {
      const itemsUl = sectionBlock.querySelector(".section-items");
      if (itemsUl) return { parent: itemsUl, before: null };
    }
  }

  const itemsUl = hit.closest(".section-items");
  if (itemsUl) {
    const sectionItems = [...itemsUl.querySelectorAll(":scope > .item[data-item-id]")].filter(
      (el) => el !== draggedLi
    );
    if (!sectionItems.length) {
      return { parent: itemsUl, before: null };
    }
    const last = sectionItems.at(-1);
    if (clientY > last.getBoundingClientRect().bottom - 8) {
      return { parent: itemsUl, before: null };
    }
  }

  return resolveFlatItemTarget(
    draggedLi,
    getInsertBeforeIndex(flatItems, draggedLi, clientY),
    flatItems,
    clientY,
    listEl
  );
}

export function resolveSectionDropTarget(draggedSection, _clientX, clientY, rootChildren, listEl) {
  const siblings = rootChildren.filter((el) => el !== draggedSection);
  let insertBefore = siblings.length;
  for (let i = 0; i < siblings.length; i++) {
    const { top, height } = siblings[i].getBoundingClientRect();
    if (clientY < top + height / 2) {
      insertBefore = i;
      break;
    }
  }
  return { parent: listEl, before: siblings[insertBefore] ?? null };
}

export function resolveTaskDropTarget(draggedLi, clientY, flatItems, listEl) {
  const insertBefore = getInsertBeforeIndex(flatItems, draggedLi, clientY);
  const target = flatItems[insertBefore];
  if (target && target !== draggedLi) {
    return { parent: target.parentElement, before: target };
  }
  const others = flatItems.filter((el) => el !== draggedLi);
  const last = others.at(-1);
  if (last) return { parent: last.parentElement, before: null };
  return { parent: listEl, before: null };
}

function positionDropPlaceholder(placeholder, draggedLi, clientX, clientY, flatItems, listEl, resolveDrop, dragState) {
  const target = resolveDrop(draggedLi, clientX, clientY, flatItems, listEl, dragState);
  if (!target?.parent) return;
  const { parent, before } = target;
  if (before === placeholder) return;
  if (placeholder.parentElement === parent) {
    const next = before ?? null;
    if (placeholder.nextElementSibling === next) return;
  }
  if (before) {
    parent.insertBefore(placeholder, before);
  } else {
    parent.appendChild(placeholder);
  }
}

function handleItemDragMove(e, listEl, dragState) {
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const block = hit?.closest(".section-block");

  $$(".section-block").forEach((el) => {
    el.classList.remove("drag-over-header");
    if (el !== block) clearSectionExpandTimer(el);
  });

  const boundary = resolveSectionPairBoundary(listEl, e.clientY, dragState);
  if (boundary?.parent === listEl) return;

  if (!block) return;

  const overHeader = hit.closest(".section-header");
  if (overHeader) {
    block.classList.add("drag-over-header");
    if (block.classList.contains("is-collapsed")) scheduleSectionExpand(block);
  }
}

export function setupPointerDrag(li, handle, options) {
  const {
    listEl,
    itemSelector,
    getChildren: getChildrenOption,
    placeholderClass = "drag-placeholder",
    placeholderTag = "li",
    measureEl,
    resolveDrop,
    onReorder,
    onDragMove,
    onDragStart,
    onDragEnd,
    draggingListClass,
  } = options;

  let dragging = false;
  let placeholder = null;
  let lastInsertBefore = 0;
  const dragState = { betweenPairs: new Map() };

  const getChildren = () => {
    const children = getChildrenOption
      ? getChildrenOption()
      : [...listEl.querySelectorAll(itemSelector)];
    return children.filter((el) => !el.classList.contains("dragging-source"));
  };

  const removePlaceholder = () => {
    placeholder?.remove();
    placeholder = null;
  };

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    onDragStart?.(li);

    const source = measureEl ? li.querySelector(measureEl) : li;
    const height = source.offsetHeight;

    placeholder = document.createElement(placeholderTag);
    placeholder.className = placeholderClass;
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.height = `${height}px`;

    li.before(placeholder);
    li.classList.add("dragging-source");

    dragging = true;
    draggingListClass && listEl.classList.add(draggingListClass);
    const children = getChildren();
    lastInsertBefore = getInsertBeforeIndex(children, li, e.clientY);
    positionDropPlaceholder(
      placeholder,
      li,
      e.clientX,
      e.clientY,
      children,
      listEl,
      resolveDrop,
      dragState
    );
    handle.setPointerCapture(e.pointerId);
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging || !placeholder) return;
    const children = getChildren();
    lastInsertBefore = getInsertBeforeIndex(children, li, e.clientY);
    positionDropPlaceholder(
      placeholder,
      li,
      e.clientX,
      e.clientY,
      children,
      listEl,
      resolveDrop,
      dragState
    );
    onDragMove?.(e, li, dragState);
  });

  const finishDrag = async (e) => {
    if (!dragging) return;
    dragging = false;
    draggingListClass && listEl.classList.remove(draggingListClass);
    if (handle.hasPointerCapture(e.pointerId)) {
      handle.releasePointerCapture(e.pointerId);
    }

    clearAllSectionExpandTimers();
    $$(".section-block").forEach((el) => el.classList.remove("drag-over-header"));
    dragState.betweenPairs.clear();

    onDragEnd?.(li);

    if (placeholder?.parentElement) {
      placeholder.replaceWith(li);
    }
    li.classList.remove("dragging-source");
    removePlaceholder();

    const children = getChildren();
    const draggedId = options.getId ? options.getId(li) : null;
    await onReorder(draggedId, lastInsertBefore, children, li);
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
}

export { handleItemDragMove };
