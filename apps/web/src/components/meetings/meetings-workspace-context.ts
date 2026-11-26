import { createContext, useContext } from "react";

import type { ChangeMeetingView, MeetingSearch } from "@/lib/meetings/navigation";
import type { MeetingQueries } from "@/queries/meetings/options";

/** The queries and view state that every part of the meetings workspace shares. */
export type MeetingsWorkspaceValue = {
  queries: MeetingQueries;
  search: MeetingSearch;
  change: ChangeMeetingView;
};

export const MeetingsWorkspaceContext = createContext<MeetingsWorkspaceValue | null>(null);

export function useMeetingsWorkspace() {
  const context = useContext(MeetingsWorkspaceContext);
  if (!context) throw new Error("Meetings views must be rendered inside a MeetingsWorkspace.");
  return context;
}
