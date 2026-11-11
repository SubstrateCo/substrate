import type { conversationReadInput } from "@substrate/contracts/messaging/read-state";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const unreadCounts = ({ data, signal }: ApiInput<{ organizationId: string }>) =>
  readResult(api.messaging.unread.$get({ query: data }, { init: { signal } }));
export const markConversationRead = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationReadInput>>) =>
  readResult(api.messaging.read.$post({ json: data }, { init: { signal } }));
