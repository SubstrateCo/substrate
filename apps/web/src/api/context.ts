import type {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextTarget,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
} from "@startup-os/contracts/context/input";

import { api, type ApiInput } from "./client";
import { readResult } from "./result";
import type { z } from "zod";

export const getMessageLinks = ({ data, signal }: ApiInput<z.input<typeof contextMessage>>) =>
  readResult(api.context["message-links"].$get({ query: data }, { init: { signal } }));
export const getMessagePeople = ({ data, signal }: ApiInput<z.input<typeof contextMessage>>) =>
  readResult(api.context["message-people"].$get({ query: data }, { init: { signal } }));
export const getRelatedContext = ({ data, signal }: ApiInput<z.input<typeof contextEntity>>) =>
  readResult(api.context.related.$get({ query: data }, { init: { signal } }));
export const getMessageTarget = ({ data, signal }: ApiInput<z.input<typeof contextTarget>>) =>
  readResult(api.context["message-target"].$get({ query: data }, { init: { signal } }));
export const searchContext = ({ data, signal }: ApiInput<z.input<typeof contextSearch>>) =>
  readResult(api.context.search.$post({ json: data }, { init: { signal } }));
export const createTaskFromMessage = ({
  data,
  signal,
}: ApiInput<z.input<typeof contextSourceTask>>) =>
  readResult(api.context["source-tasks"].$post({ json: data }, { init: { signal } }));
export const attachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$post({ json: data }, { init: { signal } }));
export const detachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$delete({ json: data }, { init: { signal } }));
export const getActivity = ({ data, signal }: ApiInput<z.input<typeof contextEntity>>) =>
  readResult(api.context.activity.$get({ query: data }, { init: { signal } }));
export const getNotifications = ({ data, signal }: ApiInput<z.input<typeof contextWorkspace>>) =>
  readResult(api.context.notifications.$get({ query: data }, { init: { signal } }));
export const markRead = ({ data, signal }: ApiInput<z.input<typeof contextNotification>>) =>
  readResult(api.context.notifications.read.$post({ json: data }, { init: { signal } }));
