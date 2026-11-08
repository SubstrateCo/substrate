import type {
  conversationInput,
  conversationTargetInput,
  leaveInput,
  ownerInput,
  membersInput,
  messageInput,
  messageListInput,
  profileInput,
  reactionInput,
  workspaceInput,
} from "@startup-os/contracts/messaging/input";

import { api, type ApiInput } from "../client";
import { readResult } from "../result";
import type { z } from "zod";

export type Message = Awaited<ReturnType<typeof listMessages>>[number];

export const listConversations = ({ data, signal }: ApiInput<z.input<typeof workspaceInput>>) =>
  readResult(api.messaging.conversations.$get({ query: data }, { init: { signal } }));
export const listMessages = ({ data, signal }: ApiInput<z.input<typeof messageListInput>>) =>
  readResult(api.messaging.messages.$get({ query: data }, { init: { signal } }));
export const createConversation = ({ data, signal }: ApiInput<z.input<typeof conversationInput>>) =>
  readResult(api.messaging.conversations.$post({ json: data }, { init: { signal } }));
export const sendMessage = ({ data, signal }: ApiInput<z.input<typeof messageInput>>) =>
  readResult(api.messaging.messages.$post({ json: data }, { init: { signal } }));
export const toggleReaction = ({ data, signal }: ApiInput<z.input<typeof reactionInput>>) =>
  readResult(api.messaging.reactions.$post({ json: data }, { init: { signal } }));
export const addMembers = ({ data, signal }: ApiInput<z.input<typeof membersInput>>) =>
  readResult(api.messaging.members.$post({ json: data }, { init: { signal } }));
export const getProfile = ({ data, signal }: ApiInput<z.input<typeof profileInput>>) =>
  readResult(api.messaging.profiles.$get({ query: data }, { init: { signal } }));

export type ManagedConversation = Awaited<ReturnType<typeof listManagedConversations>>[number];

export const listManagedConversations = ({
  data,
  signal,
}: ApiInput<z.input<typeof workspaceInput>>) =>
  readResult(api.messaging.conversations.managed.$get({ query: data }, { init: { signal } }));
export const getDeleteImpact = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationTargetInput>>) =>
  readResult(
    api.messaging.conversations["delete-impact"].$get({ query: data }, { init: { signal } }),
  );
export const joinConversation = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationTargetInput>>) =>
  readResult(api.messaging.conversations.join.$post({ json: data }, { init: { signal } }));
export const leaveConversation = ({ data, signal }: ApiInput<z.input<typeof leaveInput>>) =>
  readResult(api.messaging.conversations.leave.$post({ json: data }, { init: { signal } }));
export const transferOwnership = ({ data, signal }: ApiInput<z.input<typeof ownerInput>>) =>
  readResult(api.messaging.conversations.owner.$post({ json: data }, { init: { signal } }));
export const deleteConversation = ({
  data,
  signal,
}: ApiInput<z.input<typeof conversationTargetInput>>) =>
  readResult(api.messaging.conversations.delete.$post({ json: data }, { init: { signal } }));
