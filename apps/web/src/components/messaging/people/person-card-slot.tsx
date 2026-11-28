import { useContext, type ReactElement, type ReactNode } from "react";

import { PersonCardContext, type PersonCardRenderer } from "./person-card-context";

export function PersonCardProvider({
  render,
  children,
}: {
  render: PersonCardRenderer;
  children: ReactNode;
}) {
  return <PersonCardContext.Provider value={render}>{children}</PersonCardContext.Provider>;
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
