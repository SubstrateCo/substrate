import type { ConversationKind } from "@substrate/contracts/messaging/input";

import { createConversationDraftSchema } from "./create-conversation-validation";
import { expect, test } from "bun:test";

const person = (email: string) => ({ email });
type Draft = { name?: string; recipients?: { email: string }[] };
const messages = (kind: ConversationKind, draft: Draft) =>
  createConversationDraftSchema(kind)
    .safeParse({ name: "", recipients: [], isPrivate: false, ...draft })
    .error?.issues.map((issue) => issue.message) ?? [];

test("each kind explains in plain words what is missing", () => {
  expect(messages("channel", {})).toEqual(["Enter a channel name."]);
  expect(messages("dm", {})).toEqual(["Choose a person to message."]);
  expect(messages("group", { recipients: [person("a@x.test")] })).toEqual([
    "Choose at least two people for a group message.",
  ]);
});

test("a complete draft of each kind is valid", () => {
  expect(messages("channel", { name: "launch" })).toEqual([]);
  expect(messages("dm", { recipients: [person("a@x.test")] })).toEqual([]);
  expect(messages("group", { recipients: [person("a@x.test"), person("b@x.test")] })).toEqual([]);
});

test("a DM has exactly one person and recipients stay within the server limit", () => {
  expect(messages("dm", { recipients: [person("a@x.test"), person("b@x.test")] })).toEqual([
    "Choose a person to message.",
  ]);
  const many = Array.from({ length: 31 }, (_, index) => person(`p${index}@x.test`));
  expect(messages("channel", { name: "launch", recipients: many })).toEqual([
    "Add no more than 30 people.",
  ]);
});
