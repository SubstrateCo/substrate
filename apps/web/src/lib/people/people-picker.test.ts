import { addTypedRecipients, matchPeople, recipientFor } from "./people-picker";
import { expect, test } from "bun:test";

const ada = { id: "u1", name: "Ada Lovelace", email: "ada@northstar.test" };
const bob = { id: "u2", name: "Bob Chen", email: "Bob@Northstar.test" };

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

test("addresses past the limit stay as text", () => {
  expect(addTypedRecipients([], "a@x.test b@x.test", [], { max: 1 })).toEqual({
    value: [{ email: "a@x.test" }],
    rest: "b@x.test",
  });
});
