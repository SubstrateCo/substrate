import { createContext, type Ref } from "react";

export type ReferencePickerHandle = {
  /** Moves the selected option by `delta`, within the list. */
  move: (delta: number) => void;
  /** Inserts the selected option. */
  choose: () => void;
};

/** Links the picker to the composer editor that owns its keyboard focus. */
export const ReferencePickerLink = createContext<{
  listId: string;
  handle: Ref<ReferencePickerHandle>;
  onActiveOptionChange: (id: string | undefined) => void;
} | null>(null);
