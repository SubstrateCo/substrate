import type { InteractionWrite } from "@substrate/contracts/context/interactions";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";

export const listInteractions = ({
  data,
  signal,
}: ApiInput<{ organizationId: string; contactEntityId: string }>) =>
  readResult(api.context.interactions.$get({ query: data }, { init: { signal } }));
export const mutateInteraction = ({ data, signal }: ApiInput<InteractionWrite>) =>
  readResult(api.context.interactions.mutations.$post({ json: data }, { init: { signal } }));
