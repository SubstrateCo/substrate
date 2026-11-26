import {
  addTypedRecipients,
  limitMessage,
  matchPeople,
  recipientFor,
  recipientAgentIds,
  recipientEmails,
  recipientKey,
  invitedRecipients,
  unfinishedRecipientMessage,
} from "./people-picker";
import { expect, test } from "bun:test";

const ada = { id: "u1", name: "Ada Lovelace", email: "ada@northstar.test" };
const bob = { id: "u2", name: "Bob Chen", email: "Bob@Northstar.test" };

test("agents stay distinct from people and email invitations", () => {
  const agent = { agent: { id: "u1", name: "Ada's assistant" } };
  const person = { email: ada.email, person: ada };
  const invitation = { email: "guest@example.test" };
  const selected = [agent, person, invitation];
  expect(recipientEmails(selected)).toEqual([ada.email, invitation.email]);
  expect(recipientAgentIds(selected)).toEqual(["u1"]);
  expect(invitedRecipients(selected)).toEqual([invitation]);
  expect(recipientKey(agent)).not.toBe(recipientKey(person));
  expect(matchPeople([ada, bob], "", [agent])).toEqual([ada, bob]);
  expect(addTypedRecipients([agent], ada.email, [ada], { max: 1 }).overflow).toBe(true);
});

test("people match by name or email and chosen people drop out", () => {
  expect(matchPeople([ada, bob], "chen", [])).toEqual([bob]);
  expect(matchPeople([ada, bob], "NORTHSTAR", [])).toEqual([ada, bob]);
  expect(matchPeople([ada, bob], "", [{ email: "bob@northstar.test", person: bob }])).toEqual([
    ada,
  ]);
});

test("a typed address of an offered person picks that person instead of inviting them", () => {
  expect(recipientFor(" BOB@northstar.test ", [ada, bob], true)).toEqual({
    email: "bob@northstar.test",
    person: bob,
  });
  expect(recipientFor("sam@partner.test", [ada, bob], true)).toEqual({ email: "sam@partner.test" });
  expect(recipientFor("sam@partner.test", [ada, bob], false)).toBeUndefined();
  expect(recipientFor("sam@", [ada, bob], true)).toBeUndefined();
});

test("pasted addresses are added once, and unusable text is kept for correction", () => {
  const { value, rest } = addTypedRecipients(
    [{ email: "ada@northstar.test", person: ada }],
    "ada@northstar.test, sam@partner.test; not-an-email sam@partner.test",
    [ada, bob],
  );
  expect(value.map((recipient) => recipient.email)).toEqual([
    "ada@northstar.test",
    "sam@partner.test",
  ]);
  expect(rest).toBe("not-an-email");
});

test("text left in the picker is reported by name, and blank text is not", () => {
  expect(unfinishedRecipientMessage("  sam@  ")).toBe(
    "“sam@” isn’t a complete email address. Finish it or clear it.",
  );
  expect(unfinishedRecipientMessage("   ")).toBeUndefined();
});

test("addresses past the limit are refused together and all stay as text", () => {
  expect(addTypedRecipients([], "a@x.test b@x.test", [], { max: 1 })).toEqual({
    value: [],
    rest: "a@x.test, b@x.test",
    overflow: true,
  });
});

test("a pasted address that fits is added and unusable text stays beside it", () => {
  expect(addTypedRecipients([], "a@x.test, nope", [], { max: 1 })).toEqual({
    value: [{ email: "a@x.test" }],
    rest: "nope",
    overflow: false,
  });
});

test("an address that is already chosen does not count against the limit", () => {
  const value = [{ email: "a@x.test" }];
  expect(addTypedRecipients(value, "a@x.test", [], { max: 1 })).toEqual({
    value,
    rest: "",
    overflow: false,
  });
});

test("leftover addresses that all parse are reported as too many, not as incomplete", () => {
  const limit = limitMessage(1);
  expect(unfinishedRecipientMessage("a@x.test, b@x.test", limit)).toBe("Choose one person.");
  expect(unfinishedRecipientMessage("a@x.test, nope", limit)).toBe(
    "“a@x.test, nope” isn’t a complete email address. Finish it or clear it.",
  );
});
