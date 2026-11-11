import { useMutation } from "@tanstack/react-query";

/** Copies text to the clipboard as a mutation, so callers read its pending and error state. */
export function useCopyText() {
  return useMutation({ mutationFn: (text: string) => navigator.clipboard.writeText(text) });
}
