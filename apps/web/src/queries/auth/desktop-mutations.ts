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

export function useElectronTransfer() {
  return useMutation({
    mutationFn: async (query: ElectronAuthorization | undefined) => {
      if (!query) throw new Error("Open sign-in from Substrate to try again.");
      const result = await authClient.electron.transferUser({ fetchOptions: { query } });
      if (result.error) throw new Error("Could not return to Substrate. Please try again.");
    },
  });
}
