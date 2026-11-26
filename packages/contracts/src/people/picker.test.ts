import { matchPeople } from "./picker";
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

test("a chosen agent does not hide a person", () => {
  expect(matchPeople([ada, bob], "", [{ agent: { id: "u1", name: "Ada's assistant" } }])).toEqual([
    ada,
    bob,
  ]);
});
