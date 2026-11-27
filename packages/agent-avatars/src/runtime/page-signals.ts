/** Page-wide input that every avatar shares, behind one set of listeners. */
interface PageSignals {
  lastActivity: number;
  pointer: { x: number; y: number } | null;
  pointerAt: number;
  focus: Element | null;
  focusAt: number;
}

const signals: PageSignals = {
  lastActivity: 0,
  pointer: null,
  pointerAt: 0,
  focus: null,
  focusAt: 0,
};

let users = 0;

function onActivity() {
  signals.lastActivity = performance.now();
}

function onPointer(event: PointerEvent) {
  signals.pointer = { x: event.clientX, y: event.clientY };
  signals.pointerAt = performance.now();
  signals.lastActivity = signals.pointerAt;
}

function onPointerLeave() {
  signals.pointer = null;
}

function onFocus(event: FocusEvent) {
  signals.focus = event.target instanceof Element ? event.target : null;
  signals.focusAt = performance.now();
}

const PASSIVE = { passive: true, capture: true } as const;
const ACTIVITY_EVENTS = ["keydown", "wheel", "scroll", "touchstart", "pointerdown"] as const;

/** Starts listening while at least one avatar needs page signals. */
export function acquirePageSignals(): () => void {
  users++;
  if (users === 1) {
    signals.lastActivity = performance.now();
    window.addEventListener("pointermove", onPointer, PASSIVE);
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("focusin", onFocus, PASSIVE);
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, PASSIVE);
  }
  return () => {
    users--;
    if (users > 0) return;
    window.removeEventListener("pointermove", onPointer, PASSIVE);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("focusin", onFocus, PASSIVE);
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, PASSIVE);
  };
}

export function pageSignals(): Readonly<PageSignals> {
  return signals;
}
