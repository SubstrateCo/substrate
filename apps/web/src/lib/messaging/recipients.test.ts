import { parseRecipientEmails } from "./recipients";
import { expect, test } from "bun:test";

test("recipient entry accepts exact addresses across domains and removes duplicates", () => {
  expect(
    parseRecipientEmails("Alex@team.com, pat@outside.org; alex@team.com\n sam@other.net"),
  ).toEqual(["alex@team.com", "pat@outside.org", "sam@other.net"]);
  expect(() => parseRecipientEmails("alex")).toThrow("complete email addresses");
  expect(() => parseRecipientEmails("Alex <alex@team.com>")).toThrow("complete email addresses");
});
