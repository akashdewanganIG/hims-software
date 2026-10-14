"use client";

import * as React from "react";

/**
 * Newly added records, waiting to be shown. A write that adds a record marks
 * its id; the next element on screen tagged `data-fresh-id="<id>"` scrolls
 * into view and blinks green (the `[data-fresh]` animation in globals.css).
 * The record usually appears a moment later, once the refetch lands, so ids
 * wait here until an element shows up — or are dropped after a while.
 */
const WAIT_MS = 15_000;
const FLASH_MS = 3_200;

const pending = new Map<string, number>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

function emit() {
  snapshot = new Set(pending.keys());
  for (const listener of listeners) listener();
}

export function markFresh(ids: Array<string | undefined> | string | undefined) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id): id is string =>
    Boolean(id)
  );
  if (!list.length) return;
  const until = Date.now() + WAIT_MS;
  for (const id of list) pending.set(id, until);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ReadonlySet<string> = new Set();

/** Ids added but not yet shown — lets a paged list jump to the right page. */
export function useFreshIds(): ReadonlySet<string> {
  return React.useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY
  );
}

const rendered = (el: Element) => el.getClientRects().length > 0;
/** Not behind an open modal (which hides the rest of the page). */
const reachable = (el: Element) => !el.closest("[aria-hidden='true']");

/** Fully visible inside every scrolling box around it, and the window. */
function inView(el: Element) {
  const rect = el.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > window.innerHeight) return false;
  for (let box = el.parentElement; box; box = box.parentElement) {
    const { overflowY } = getComputedStyle(box);
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    const bounds = box.getBoundingClientRect();
    if (rect.top < bounds.top || rect.bottom > bounds.bottom) return false;
  }
  return true;
}

/** Finds pending ids on screen, then scrolls to and flashes them. */
function reveal() {
  const now = Date.now();
  let scrolled = false;
  let changed = false;
  for (const [id, until] of pending) {
    if (until < now) {
      pending.delete(id);
      changed = true;
      continue;
    }
    const found = [
      ...document.querySelectorAll(`[data-fresh-id="${CSS.escape(id)}"]`),
    ].filter(rendered);
    if (!found.length) continue;
    pending.delete(id);
    changed = true;
    for (const el of found) {
      el.setAttribute("data-fresh", "");
      window.setTimeout(() => el.removeAttribute("data-fresh"), FLASH_MS);
    }
    // One scroll per batch, to the copy the user can see (in an open dialog
    // rather than on the page behind it).
    const target = found.find(reachable) ?? found[0]!;
    if (!scrolled && !inView(target)) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolled = true;
    }
  }
  if (changed) emit();
}

/**
 * Mounted once (in Providers): watches the page while records are waiting,
 * and stops watching when none are.
 */
export function FreshHighlighter() {
  const ids = useFreshIds();
  const waiting = ids.size > 0;
  React.useEffect(() => {
    if (!waiting) return;
    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          reveal();
        });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    // Expiry, and records already on screen when they were marked.
    const timer = window.setInterval(schedule, 1_000);
    schedule();
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [waiting]);
  return null;
}
