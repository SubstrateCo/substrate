import { createContext, type Ref } from "react";

export type ReferencePickerHandle = {
  /** Moves the selected option by `delta`, wrapping around the list. */
  move: (delta: number) => void;
  /**
   * Inserts the selected option. Returns false when there is nothing to choose and nothing is
   * loading, so the key can do its usual work.
   */
  choose: () => boolean;
  /** Switches to the next tab, or the previous one for a negative `delta`, wrapping around. */
  cycle: (delta: number) => void;
};

/** Links the picker to the composer editor that owns its keyboard focus. */
export const ReferencePickerLink = createContext<{
  listId: string;
  handle: Ref<ReferencePickerHandle>;
  onActiveOptionChange: (id: string | undefined) => void;
  /** Closes the picker until this reference query ends, such as when it matches nothing. */
  onDismiss: () => void;
} | null>(null);
