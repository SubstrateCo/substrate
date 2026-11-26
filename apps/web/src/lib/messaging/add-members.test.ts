import { addConversationRecipients, AddMembersError } from "./add-members";
import { expect, test } from "bun:test";

const person = {
  email: "ada@example.test",
  person: { id: "ada", name: "Ada", email: "ada@example.test" },
};
const agent = { agent: { id: "assistant", name: "Assistant" } };

test("mixed recipients use email membership for people and owned-agent membership for agents", async () => {
  const emails: string[][] = [];
  const agents: string[] = [];
  await addConversationRecipients([person, agent], {
    people: async (value) => {
      emails.push(value);
    },
    agent: async (id) => {
      agents.push(id);
    },
  });
  expect(emails).toEqual([["ada@example.test"]]);
  expect(agents).toEqual(["assistant"]);
});

test("agent-only selection never calls the manager-only people action", async () => {
  let peopleCalls = 0;
  const agents: string[] = [];
  await addConversationRecipients([agent], {
    people: async () => {
      peopleCalls++;
    },
    agent: async (id) => {
      agents.push(id);
    },
  });
  expect(peopleCalls).toBe(0);
  expect(agents).toEqual(["assistant"]);
});

test("partial failure identifies completed selections so only the remaining choices are retried", async () => {
  const second = { agent: { id: "second", name: "Second" } };
  let failure: unknown;
  try {
    await addConversationRecipients([person, agent, second], {
      people: async () => {},
      agent: async (id) => {
        if (id === "second") throw new Error("Agent is disabled.");
      },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AddMembersError);
  if (!(failure instanceof AddMembersError)) throw failure;
  expect(failure.completed).toEqual([person, agent]);
  expect(failure.message).toContain("2 added");
  expect(failure.message).toContain("Agent is disabled.");
});
