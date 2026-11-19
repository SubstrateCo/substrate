import { useEffect, useRef, useState } from "react";

/** Writes to the clipboard and reports the outcome of the latest request. */
export function useCopyText() {
  const [state, setState] = useState<{ isPending: boolean; error: Error | null }>({
    isPending: false,
    error: null,
  });
  const latest = useRef<object | null>(null);
  useEffect(
    () => () => {
      latest.current = null;
    },
    [],
  );

  async function copy(
    text: string,
    { onSuccess, onError }: { onSuccess?: () => void; onError?: (error: Error) => void } = {},
  ) {
    const request = {};
    latest.current = request;
    setState({ isPending: true, error: null });
    try {
      await navigator.clipboard.writeText(text);
    } catch (cause) {
      if (latest.current !== request) return;
      const error = cause instanceof Error ? cause : new Error("Couldn't copy text", { cause });
      setState({ isPending: false, error });
      onError?.(error);
      return;
    }
    if (latest.current !== request) return;
    setState({ isPending: false, error: null });
    onSuccess?.();
  }

  return {
    ...state,
    mutate: (...args: Parameters<typeof copy>) => void copy(...args),
  };
}
