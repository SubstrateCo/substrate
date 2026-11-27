import { useQuery } from "@tanstack/react-query";

import { useEffect } from "react";

import { isAccessFailure } from "@/api/access-failure";
import { attentionBridge } from "@/lib/desktop/bridges";
import { attentionOptions } from "@/queries/attention";

export function useDesktopAttention(userId: string) {
  const bridge = attentionBridge();
  const summary = useQuery({ ...attentionOptions(userId), enabled: !!bridge });
  const count = isAccessFailure(summary.error) ? 0 : summary.data?.count;
  useEffect(() => {
    if (count !== undefined) void bridge?.set({ userId, count }).catch(() => {});
  }, [bridge, userId, count]);
  useEffect(
    () => () => {
      void bridge?.set({ userId, count: 0 }).catch(() => {});
    },
    [bridge, userId],
  );
}
