import { useRouter, type RouterHistory } from "@tanstack/react-router";

import type { AgentSettingsPage } from "@/lib/agent-work/agent-sections";
import { panelReturnDelta } from "@/lib/navigation/panel-history";

type PanelSearch = {
  recordId?: string;
  contactId?: string;
  interactionId?: string;
  taskId?: string;
  eventId?: string;
  sheet?: boolean;
  settings?: AgentSettingsPage;
  messageId?: string;
  turnId?: string;
};

const returning = new WeakSet<RouterHistory>();

/** Close, Escape and outside dismissal all navigate through the router's draft blockers. */
export function usePanelReturn() {
  const router = useRouter();
  return (search: PanelSearch) => {
    const target = router.buildLocation({
      to: ".",
      search: (previous) => ({
        ...previous,
        ...search,
      }),
      hash: true,
    });
    if (returning.has(router.history) || target.href === router.history.location.href) return;
    const delta = panelReturnDelta(router.history, target.href, Object.keys(search));
    if (delta !== undefined) {
      returning.add(router.history);
      // A cancelled blocker also notifies with the unchanged location, allowing another attempt.
      const unsubscribe = router.history.subscribe(() => {
        returning.delete(router.history);
        unsubscribe();
      });
      router.history.go(delta);
    } else void router.navigate({ href: target.href, replace: true, resetScroll: false });
  };
}
