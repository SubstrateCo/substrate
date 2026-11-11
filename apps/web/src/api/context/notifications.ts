import type { contextWorkspace } from "@substrate/contracts/context/input";
import type {
  notificationGroupsInput,
  notificationGroupEventsInput,
  notificationGroupReadInput,
} from "@substrate/contracts/context/notification-groups";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const getNotificationGroups = ({
  data,
  signal,
}: ApiInput<z.output<typeof notificationGroupsInput>>) =>
  readResult(
    api.context.notifications.groups.$get(
      { query: { ...data, limit: String(data.limit) } },
      { init: { signal } },
    ),
  );
export const getNotificationGroupEvents = ({
  data,
  signal,
}: ApiInput<z.output<typeof notificationGroupEventsInput>>) =>
  readResult(
    api.context.notifications.events.$get(
      { query: { ...data, limit: String(data.limit) } },
      { init: { signal } },
    ),
  );
export const getNotificationUnread = ({
  data,
  signal,
}: ApiInput<z.output<typeof contextWorkspace>>) =>
  readResult(api.context.notifications.unread.$get({ query: data }, { init: { signal } }));
export const markGroupRead = ({
  data,
  signal,
}: ApiInput<z.output<typeof notificationGroupReadInput>>) =>
  readResult(api.context.notifications["read-group"].$post({ json: data }, { init: { signal } }));

export const markAllRead = ({ data, signal }: ApiInput<z.input<typeof contextWorkspace>>) =>
  readResult(api.context.notifications["read-all"].$post({ json: data }, { init: { signal } }));
