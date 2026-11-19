import { createContext, useContext, type ReactElement, type ReactNode } from "react";

export type PersonCardRenderer = (
  actorId: string,
  name: string,
  trigger: ReactElement,
) => ReactNode;

export const PersonCardContext = createContext<PersonCardRenderer | null>(null);

export function useHasPersonCard() {
  return useContext(PersonCardContext) !== null;
}
