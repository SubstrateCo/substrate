import { createConversationProblem, recipientFor } from "./recipients";
import { describe, expect, test } from "bun:test";

const ada = { id: "u1", name: "Ada", email: "ada@example.com" };

describe("recipients", () => {
  test("a typed member address picks the member; another address is an invitation", () => {
    expect(recipientFor(" Ada@Example.com ", [ada])).toEqual({
      email: "ada@example.com",
      person: ada,
    });
    expect(recipientFor("pat@partner.com", [ada])).toEqual({ email: "pat@partner.com" });
    expect(recipientFor("not an email", [ada])).toBeUndefined();
  });

  test("each kind asks for the people it needs", () => {
    const one = [{ email: "ada@example.com" }];
    expect(createConversationProblem("channel", { name: " ", recipients: [] })?.field).toBe("name");
    expect(createConversationProblem("dm", { name: "", recipients: [] })?.field).toBe("recipients");
    expect(createConversationProblem("group", { name: "", recipients: one })?.field).toBe(
      "recipients",
    );
    expect(createConversationProblem("dm", { name: "", recipients: one })).toBeUndefined();
  });
});
