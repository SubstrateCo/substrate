import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateMessageWork } from "./mutations";
import { attachWork } from "@/api/context/links";

export function useAttachMessageWork<T extends { id: string; projectEntityId: string | null }>(
  organizationId: string,
  messageId: string,
) {
  const client = useQueryClient();
  return useMutation({
    // The API links one item per request. Each request settles on its own, so earlier links stay.
    mutationFn: async (items: T[]) => {
      const settled = await Promise.allSettled(
        items.map((item) => attachWork({ data: { organizationId, messageId, entityId: item.id } })),
      );
      const failures: { item: T; error: Error }[] = [];
      const refreshes: Promise<unknown>[] = [];
      items.forEach((item, index) => {
        const result = settled[index]!;
        if (result.status === "fulfilled")
          refreshes.push(
            invalidateMessageWork(client, organizationId, messageId, item.id, item.projectEntityId),
          );
        else
          failures.push({
            item,
            error:
              result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
          });
      });
      await Promise.all(refreshes);
      return failures;
    },
  });
}
