import {
  createConversationProblem,
  invitedRecipients,
  recipientEmails,
  recipientFor,
} from "./recipients";
import { describe, expect, test } from "bun:test";

const ada = { id: "u1", name: "Ada", email: "ada@example.com" };

describe("recipients", () => {
  test("mixed recipients keep agents out of email requests and invitations", () => {
    const agent = { agent: { id: "assistant", name: "Assistant" } };
    const person = { email: ada.email, person: ada };
    const invitation = { email: "pat@partner.com" };
    const recipients = [person, agent, invitation];

    expect(recipientEmails(recipients)).toEqual([ada.email, invitation.email]);
    expect(invitedRecipients(recipients)).toEqual([invitation]);
    expect(recipientEmails([agent])).toEqual([]);
    expect(invitedRecipients([agent])).toEqual([]);
  });

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
