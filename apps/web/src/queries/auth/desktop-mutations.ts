import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/lib/auth/client";
import type { ElectronAuthorization } from "@/lib/desktop/authorization-query";
import "@/lib/desktop/auth";

export function useDesktopSignIn() {
  return useMutation({
    mutationFn: async () => {
      await window.requestAuth!();
    },
  });
}

/**
 * Waits for the desktop app to report how the browser sign-in ended. Start it after the browser
 * opens; it stays pending while the person signs in there.
 */
export function useDesktopSignInResult() {
  return useMutation({
    mutationFn: () =>
      new Promise<void>((resolve, reject) => {
        const stop = () => {
          authenticated();
          failed();
        };
        const authenticated = window.onAuthenticated!(() => {
          stop();
          resolve();
        });
        const failed = window.onAuthError!(() => {
          stop();
          reject(new Error("Could not complete sign-in. Please try again."));
        });
      }),
  });
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
