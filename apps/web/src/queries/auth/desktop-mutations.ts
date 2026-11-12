import { useMutation } from "@tanstack/react-query";

import { useEffect, useRef, useState } from "react";

import { requestDesktopSignIn } from "./desktop-sign-in";
import { authClient } from "@/lib/auth/client";
import "@/lib/desktop/auth";
import type { ElectronAuthorization } from "@/lib/desktop/authorization-query";

export function useDesktopSignIn() {
  const pending = useRef<AbortController | null>(null);
  const [opening, setOpening] = useState(false);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  const mutation = useMutation({
    mutationFn: async () => {
      pending.current?.abort();
      const controller = new AbortController();
      pending.current = controller;
      setOpening(true);
      try {
        await requestDesktopSignIn(
          {
            requestAuth: window.requestAuth!,
            onAuthenticated: window.onAuthenticated!,
            onAuthError: window.onAuthError!,
          },
          controller.signal,
          () => {
            if (!controller.signal.aborted) setOpening(false);
          },
        );
      } finally {
        if (pending.current === controller && !controller.signal.aborted) setOpening(false);
      }
    },
  });
  return { ...mutation, opening };
}

export function useElectronTransfer() {
  return useMutation({
    mutationFn: async (query: ElectronAuthorization | undefined) => {
      if (!query) throw new Error("Open sign-in from Substrate to try again.");
      const result = await authClient.electron.transferUser({ fetchOptions: { query } });
      if (result.error) throw new Error("Could not return to Substrate. Please try again.");
    },
  });
}
