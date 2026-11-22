import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { authClient } from "@/api/auth/client";
import { unwrap } from "@/api/auth/result";
import { queryKeys } from "@/queries/keys";

/** Renames the signed-in user. The frame reads the name from route context, so reload it too. */
export function useUpdateProfileName() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (name: string) => unwrap(await authClient.updateUser({ name })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.session });
      await router.invalidate();
    },
  });
}
