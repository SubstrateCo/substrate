import type { MessageContext } from "../types";
import { attachedWork, resolveReferences } from "./resolve-references";
import { describe, expect, test } from "bun:test";

function context(overrides: Partial<MessageContext>): MessageContext {
  // SAFETY: tests set only the fields the resolver reads.
  return {
    messageId: "m",
    messaging: [],
    links: [],
    people: [],
    agents: [],
    ...overrides,
  } as MessageContext;
}

describe("resolve references", () => {
  test("tasks open in the record panel with their project", () => {
    const resolved = resolveReferences(
      context({
        // SAFETY: the resolver reads only these link fields.
        links: [
          { entityId: "t", entityType: "task", title: "Ship", projectEntityId: "p" },
        ] as MessageContext["links"],
      }),
    );
    expect(resolved.get("task:t")?.destination).toEqual({
      type: "record",
      target: { kind: "task", id: "t", projectId: "p" },
    });
  });

  test("threads lead to their conversation and root message", () => {
    const resolved = resolveReferences(
      context({
        // SAFETY: the resolver reads only these reference fields.
        messaging: [
          { id: "r", kind: "thread", conversationId: "c", threadId: "r", title: "Plan" },
        ] as MessageContext["messaging"],
      }),
    );
    expect(resolved.get("thread:r")?.destination).toEqual({
      type: "conversation",
      target: { conversationId: "c", threadId: "r" },
    });
  });

  test("references the server did not resolve stay unresolved", () => {
    expect(resolveReferences(context({})).size).toBe(0);
    expect(resolveReferences(undefined).size).toBe(0);
  });

  test("linked work skips mentions and lists each record once", () => {
    // SAFETY: attachedWork reads only these link fields.
    const links = [
      { entityId: "t", purpose: "mention", canRemove: false },
      { entityId: "p", purpose: "source", canRemove: false },
      { entityId: "p", purpose: "association", canRemove: true },
    ] as MessageContext["links"];
    expect(attachedWork(links)).toEqual([
      expect.objectContaining({ entityId: "p", purpose: "source", canRemove: true }),
    ]);
  });
});
