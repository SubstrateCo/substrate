import { createContext, type Ref } from "react";

export type ReferencePickerHandle = {
  move: (delta: number) => void;
  choose: () => boolean;
  cycle: (delta: number) => void;
};

export const ReferencePickerLink = createContext<{
  listId: string;
  handle: Ref<ReferencePickerHandle>;
  onActiveOptionChange: (id: string | undefined) => void;
  onDismiss: () => void;
} | null>(null);
