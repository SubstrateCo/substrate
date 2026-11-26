import { createDraftStore, draftKey, emptyDraft } from "./draft-store";
import { describe, expect, test } from "bun:test";

describe("draft store", () => {
  test("keeps separate drafts per account, workspace, conversation and thread", () => {
    const store = createDraftStore();
    const main = draftKey("u", "org-a", "c");
    store.set(main, () => ({ body: "main", labels: {} }));
    for (const other of [
      draftKey("u", "org-b", "c"),
      draftKey("u", "org-a", "c", "thread"),
      draftKey("other", "org-a", "c"),
    ])
      expect(store.get(other)).toBe(emptyDraft);
    expect(store.get(main).body).toBe("main");
  });

  test("keeps a pending send request after the text is cleared", () => {
    const store = createDraftStore();
    const key = draftKey("u", "org", "c");
    store.set(key, () => ({ body: "", labels: {}, request: { id: "r1", fingerprint: "f" } }));
    expect(store.get(key).request?.id).toBe("r1");
  });

  test("clearing drops every draft and tells open composers", () => {
    const store = createDraftStore();
    const key = draftKey("u", "org", "c");
    let notified = 0;
    store.subscribe(key, () => notified++);
    store.set(key, () => ({ body: "hi", labels: {} }));
    store.clear();
    expect(store.get(key)).toBe(emptyDraft);
    expect(notified).toBe(2);
  });
});
