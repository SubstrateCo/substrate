import type { MessagePageContext } from "@/api/context/links";

export type MessageContextState = {
  data?: MessagePageContext;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
};
