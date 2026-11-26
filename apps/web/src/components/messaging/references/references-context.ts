import { createContext } from "react";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";

export const ReferencesContext = createContext(new Map<string, WorkspaceReference>());
