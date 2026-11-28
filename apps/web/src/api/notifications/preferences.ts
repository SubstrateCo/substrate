import type { ApiInput } from "@substrate/contracts/http-result";
import type {
  updateAccountNotificationPreferences as accountChange,
  updateConversationNotificationPreferences as conversationChange,
  updateWorkspaceNotificationPreferences as workspaceChange,
} from "@substrate/contracts/notifications/preferences";

import { api } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

type Workspace = { organizationId: string };
const preferences = api.notifications.preferences;

export const getAccountNotificationPreferences = (signal?: AbortSignal) =>
  readResult(preferences.$get({}, { init: { signal } }));

export const updateAccountNotificationPreferences = ({
  data,
  signal,
}: ApiInput<z.input<typeof accountChange>>) =>
  readResult(preferences.$patch({ json: data }, { init: { signal } }));

export const getWorkspaceNotificationPreferences = ({ data, signal }: ApiInput<Workspace>) =>
  readResult(preferences.workspace.$get({ query: data }, { init: { signal } }));

export const updateWorkspaceNotificationPreferences = ({
  data,
  signal,
}: ApiInput<z.input<typeof workspaceChange>>) =>
  readResult(preferences.workspace.$patch({ json: data }, { init: { signal } }));

export const getConversationNotificationPreferences = ({
  data: { conversationId, ...query },
  signal,
}: ApiInput<Workspace & { conversationId: string }>) =>
  readResult(
    preferences.conversations[":conversationId"].$get(
      { param: { conversationId }, query },
      { init: { signal } },
    ),
  );

export const updateConversationNotificationPreferences = ({
  data: { conversationId, ...json },
  signal,
}: ApiInput<z.input<typeof conversationChange> & { conversationId: string }>) =>
  readResult(
    preferences.conversations[":conversationId"].$patch(
      { param: { conversationId }, json },
      { init: { signal } },
    ),
  );
