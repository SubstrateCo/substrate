import type {
  contextEntity,
  contextMessage,
  contextMessagePage,
  contextTarget,
  contextLink,
  contextSourceTask,
} from "@startup-os/contracts/context/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const getMessageLinks = ({ data, signal }: ApiInput<z.input<typeof contextMessage>>) =>
  readResult(api.context["message-links"].$get({ query: data }, { init: { signal } }));
export const getMessagePage = ({ data, signal }: ApiInput<z.input<typeof contextMessagePage>>) =>
  readResult(api.context["message-page"].$post({ json: data }, { init: { signal } }));
export type MessagePageContext = Awaited<ReturnType<typeof getMessagePage>>[number];
export const getMessagePeople = ({ data, signal }: ApiInput<z.input<typeof contextMessage>>) =>
  readResult(api.context["message-people"].$get({ query: data }, { init: { signal } }));
export const getRelatedContext = ({ data, signal }: ApiInput<z.input<typeof contextEntity>>) =>
  readResult(api.context.related.$get({ query: data }, { init: { signal } }));
export const getMessageTarget = ({ data, signal }: ApiInput<z.input<typeof contextTarget>>) =>
  readResult(api.context["message-target"].$get({ query: data }, { init: { signal } }));
export const createTaskFromMessage = ({
  data,
  signal,
}: ApiInput<z.input<typeof contextSourceTask>>) =>
  readResult(api.context["source-tasks"].$post({ json: data }, { init: { signal } }));
export const attachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$post({ json: data }, { init: { signal } }));
export const detachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$delete({ json: data }, { init: { signal } }));
