import { useRef, useState, type FocusEvent, type RefObject } from "react";

import { isProjectTab, type ProjectTab } from "../project-tabs";
import { useFocusReturn } from "@/components/feedback/use-focus-return";

/**
 * The project's open tab. Leaving Tasks with unsaved task edits waits for the person to confirm
 * that they discard them.
 */
export function useGuardedTab(inspector: RefObject<HTMLElement | null>, dirty: boolean) {
  const [tab, setTab] = useState<ProjectTab>("tasks");
  const [pendingTab, setPendingTab] = useState<ProjectTab | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const lastInspectorFocus = useRef<HTMLElement | null>(null);
  const tabFocus = useFocusReturn(inspector);
  return {
    tab,
    setTab,
    tabsRef,
    pendingTab,
    restoreFocus: tabFocus.restore,
    // Tabs reports a plain string.
    change: (next: string) => {
      if (!isProjectTab(next)) return;
      if (tab === "tasks" && next !== "tasks" && dirty) {
        // Keep editing returns to where the person was working in the inspector.
        tabFocus.remember(lastInspectorFocus.current);
        setPendingTab(next);
      } else setTab(next);
    },
    trackInspectorFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target instanceof HTMLElement) lastInspectorFocus.current = event.target;
    },
    cancel: () => setPendingTab(null),
    confirm: () => {
      if (pendingTab === null) return;
      // Focus goes to the tab the person chose instead of back into the inspector.
      tabFocus.remember(
        tabsRef.current?.querySelector(
          `[role="tab"][aria-controls$="-content-${CSS.escape(pendingTab)}"]`,
        ) ?? null,
      );
      setTab(pendingTab);
      setPendingTab(null);
    },
  };
}
