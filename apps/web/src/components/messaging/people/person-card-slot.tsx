import { createContext, useContext, type ReactElement, type ReactNode } from "react";

type PersonCardRenderer = (actorId: string, name: string, trigger: ReactElement) => ReactNode;

const PersonCardContext = createContext<PersonCardRenderer | null>(null);

// Connected containers supply the card. Views mark the names that may open it.
export function PersonCardProvider({
  render,
  children,
}: {
  render: PersonCardRenderer;
  children: ReactNode;
}) {
  return <PersonCardContext.Provider value={render}>{children}</PersonCardContext.Provider>;
}

export function useHasPersonCard() {
  return useContext(PersonCardContext) !== null;
}

export function PersonCardTarget({
  actorId,
  name,
  children,
}: {
  actorId?: string | null;
  name: string;
  children: ReactElement;
}) {
  const render = useContext(PersonCardContext);
  return render && actorId ? render(actorId, name, children) : children;
}
