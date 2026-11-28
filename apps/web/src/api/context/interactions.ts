import type {
  InteractionPeriod,
  InteractionTimeline,
  InteractionWrite,
  InteractionDirectory,
} from "@substrate/contracts/context/interactions";
import type { ApiInput } from "@substrate/contracts/http-result";

import { api } from "../client";
import { readResult } from "../result";

export const listInteractions = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; contactEntityId: string }>) =>
  readResult(api.context.interactions.$get({ query: data }, { init: { signal } }));
export const mutateInteraction = ({ data, signal }: ApiInput<InteractionWrite>) =>
  readResult(api.context.interactions.mutations.$post({ json: data }, { init: { signal } }));

export const getInteractionActivity = ({ data, signal }: ApiInput<InteractionPeriod>) =>
  readResult(api.context.interactions.activity.$get({ query: data }, { init: { signal } }));
export const getInteractionTimeline = ({ data, signal }: ApiInput<InteractionTimeline>) =>
  readResult(api.context.interactions.timeline.$get({ query: data }, { init: { signal } }));
export const getInteractionDirectory = ({ data, signal }: ApiInput<InteractionDirectory>) =>
  readResult(
    api.context.interactions.directory.$get(
      {
        query: {
          ...data,
          offset: data.offset?.toString(),
          pageSize: data.pageSize?.toString(),
          count: data.count?.toString(),
          countUntil: data.countUntil?.toString(),
        },
      },
      { init: { signal } },
    ),
  );
export const getInteractionRecord = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string }>) =>
  readResult(api.context.interactions.record.$get({ query: data }, { init: { signal } }));
export const getInteractionProfile = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; entityId: string; type: "person" | "account" }>) =>
  readResult(api.context.interactions.profile.$get({ query: data }, { init: { signal } }));
