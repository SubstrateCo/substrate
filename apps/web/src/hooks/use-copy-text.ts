import { useMutation } from "@tanstack/react-query";

export function useCopyText() {
  return useMutation({ mutationFn: (text: string) => navigator.clipboard.writeText(text) });
}
