import { queryKeys } from "../queries/keys";
import { parseRecipientEmails } from "./messaging";
import { expect, test } from "bun:test";

test("recipient entry accepts exact addresses across domains and removes duplicates", () => {
  expect(
    parseRecipientEmails("Alex@team.com, pat@outside.org; alex@team.com\n sam@other.net"),
  ).toEqual(["alex@team.com", "pat@outside.org", "sam@other.net"]);
  expect(() => parseRecipientEmails("alex")).toThrow("complete email addresses");
  expect(() => parseRecipientEmails("Alex <alex@team.com>")).toThrow("complete email addresses");
});

test("message caches isolate workspace, conversation, and thread", () => {
  const key = queryKeys.messages("one", "conversation");
  expect(key).not.toEqual(queryKeys.messages("two", "conversation"));
  expect(key).not.toEqual(queryKeys.messages("one", "other"));
  expect(key).not.toEqual(queryKeys.messages("one", "conversation", "thread"));
  expect(key.slice(0, 3)).toEqual([...queryKeys.messaging("one")]);
});
