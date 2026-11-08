import { createContext, type RefCallback } from "react";

export const RealtimeContainerContext = createContext<RefCallback<HTMLDivElement> | undefined>(
  undefined,
);
