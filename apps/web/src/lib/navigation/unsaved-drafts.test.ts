import { confirmDiscardDrafts, registerUnsavedDraft, unsavedDraftNames } from "./unsaved-drafts";
import { describe, expect, mock, test } from "bun:test";

describe("unsaved drafts", () => {
  test("lets a document exit proceed when nothing is unsaved", async () => {
    expect(await confirmDiscardDrafts()).toBe(true);
  });

  test("asks once for several dirty drafts and follows the answer", async () => {
    const first = mock(() => Promise.resolve(false));
    const second = mock(() => Promise.resolve(true));
    const unregisterFirst = registerUnsavedDraft(first);
    const unregisterSecond = registerUnsavedDraft(second);

    expect(await confirmDiscardDrafts()).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    unregisterFirst();
    unregisterSecond();
  });

  test("gives the question the name of every dirty draft", async () => {
    const ask = mock((_names: readonly string[]) => Promise.resolve(true));
    const unregister = [
      registerUnsavedDraft(ask, "Project details"),
      registerUnsavedDraft(() => Promise.resolve(true), "Task edits"),
      registerUnsavedDraft(() => Promise.resolve(true), "Task edits"),
      registerUnsavedDraft(() => Promise.resolve(true)),
    ];

    await confirmDiscardDrafts();

    expect(ask).toHaveBeenCalledWith(["Project details", "Task edits"]);
    for (const stop of unregister) stop();
    expect(unsavedDraftNames()).toEqual([]);
  });

  test("stops asking once the draft is saved or discarded", async () => {
    const ask = mock(() => Promise.resolve(false));
    registerUnsavedDraft(ask)();

    expect(await confirmDiscardDrafts()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});
