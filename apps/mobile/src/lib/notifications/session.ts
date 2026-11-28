export type ToastOptions = {
  description?: string;
  action?: { label: string; onClick: () => void };
};

type ToastSink = {
  success: (title: string, options?: ToastOptions) => void;
  error: (title: string, options?: ToastOptions) => void;
  dismiss: () => void;
};

export function createToastSession(sink: ToastSink) {
  let generation = 0;
  let active = false;

  const reset = () => {
    generation += 1;
    sink.dismiss();
  };

  const capture = () => {
    const capturedGeneration = generation;
    const capturedActive = active;
    const current = () => capturedActive && active && capturedGeneration === generation;
    const show = (kind: "success" | "error", title: string, options?: ToastOptions) => {
      if (!current()) return;
      const action = options?.action;
      sink[kind](title, {
        ...options,
        action: action
          ? {
              label: action.label,
              onClick: () => {
                if (current()) action.onClick();
              },
            }
          : undefined,
      });
    };
    return {
      success: (title: string, options?: ToastOptions) => show("success", title, options),
      error: (title: string, options?: ToastOptions) => show("error", title, options),
    };
  };

  return {
    capture,
    reset,
    mount: () => {
      active = true;
      return () => {
        active = false;
        reset();
      };
    },
  };
}
