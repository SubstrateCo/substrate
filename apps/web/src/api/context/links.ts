import type {
  contextEntity,
  contextMessagePage,
  contextTargets,
  contextLink,
} from "@substrate/contracts/context/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export const getMessagePage = ({ data, signal }: ApiInput<z.input<typeof contextMessagePage>>) =>
  readResult(api.context["message-page"].$post({ json: data }, { init: { signal } }));
export type MessagePageContext = Awaited<ReturnType<typeof getMessagePage>>[number];
export const getRelatedContext = ({ data, signal }: ApiInput<z.input<typeof contextEntity>>) =>
  readResult(api.context.related.$get({ query: data }, { init: { signal } }));
export const getMessageTargets = ({ data, signal }: ApiInput<z.input<typeof contextTargets>>) =>
  readResult(api.context["message-targets"].$post({ json: data }, { init: { signal } }));
export type MessageTarget = Awaited<ReturnType<typeof getMessageTargets>>[number];
export const attachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$post({ json: data }, { init: { signal } }));
export const detachWork = ({ data, signal }: ApiInput<z.input<typeof contextLink>>) =>
  readResult(api.context.links.$delete({ json: data }, { init: { signal } }));
