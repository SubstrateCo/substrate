import { useMutation } from "@tanstack/react-query";

/** Writes to the clipboard and reports the outcome of the latest request. */
export function useCopyText() {
  return useMutation({ mutationFn: (text: string) => navigator.clipboard.writeText(text) });
}
