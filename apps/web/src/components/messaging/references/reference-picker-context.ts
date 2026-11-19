import { createContext } from "react";

export const ReferencePickerAccessibility = createContext<
  ((value: { listId: string; selectedId?: string } | null) => void) | null
>(null);
