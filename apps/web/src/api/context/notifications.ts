import type { contextWorkspace, contextNotification } from "@startup-os/contracts/context/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const getNotifications = ({ data, signal }: ApiInput<z.input<typeof contextWorkspace>>) =>
  readResult(api.context.notifications.$get({ query: data }, { init: { signal } }));
export const markRead = ({ data, signal }: ApiInput<z.input<typeof contextNotification>>) =>
  readResult(api.context.notifications.read.$post({ json: data }, { init: { signal } }));
