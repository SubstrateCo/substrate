import type { HarnessKind } from "@substrate/contracts/harness";

import { useQuery } from "@tanstack/react-query";

import {
  HarnessAvailabilityView,
  type HarnessAvailabilityState,
} from "./harness-availability-view";
import { harnessLabel } from "@/lib/agents/harness-meta";
import { harnessBridge } from "@/lib/desktop/bridges";
import { harnessStatusQueryOptions } from "@/queries/agents/harness-status";

export function HarnessAvailability({
  userId,
  organizationId,
  harness,
}: {
  userId: string;
  organizationId?: string | null;
  harness: HarnessKind;
}) {
  const desktop = !!harnessBridge() && !!organizationId;
  const status = useQuery({
    ...harnessStatusQueryOptions(userId, organizationId),
    enabled: desktop,
  });
  const entry = status.data?.find((item) => item.harness === harness);
  let state: HarnessAvailabilityState;
  if (!desktop) state = { kind: "desktop-required" };
  else if (status.isPending) state = { kind: "checking" };
  else if (status.isError) state = { kind: "error" };
  else state = { kind: "ready", available: !!entry?.available, version: entry?.version };
  return (
    <HarnessAvailabilityView
      label={harnessLabel(harness)}
      state={state}
      refreshing={status.isFetching}
      onRefresh={desktop ? () => void status.refetch() : undefined}
    />
  );
}
