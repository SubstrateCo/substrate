import {
  confirmDiscardDrafts,
  leaveDocument,
  registerUnsavedDraft,
  unsavedDraftNames,
} from "./unsaved-drafts";
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

describe("leaving the document", () => {
  /** A document location that records each exit. */
  function recordingLocation() {
    const exits: string[] = [];
    return {
      exits,
      location: {
        assign: (url: string | URL) => void exits.push(String(url)),
        reload: () => void exits.push("reload"),
      },
    };
  }

  test("stays, without preparing, when the person keeps editing", async () => {
    const { exits, location } = recordingLocation();
    const prepare = mock(() => Promise.resolve());
    const unregister = registerUnsavedDraft(() => Promise.resolve(false));

    expect(await leaveDocument("/login", prepare, location)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(exits).toEqual([]);
    unregister();
  });

  test("prepares, then loads the destination after the person agrees", async () => {
    const { exits, location } = recordingLocation();
    const unregister = registerUnsavedDraft(() => Promise.resolve(true));

    expect(await leaveDocument("/login", async () => void exits.push("prepare"), location)).toBe(
      true,
    );
    expect(exits).toEqual(["prepare", "/login"]);
    unregister();
  });

  test("stays when preparing fails", async () => {
    const { exits, location } = recordingLocation();
    const outcome = await leaveDocument(
      "/login",
      () => Promise.reject(new Error("offline")),
      location,
    ).catch((error: Error) => error);
    expect(outcome).toMatchObject({ message: "offline" });
    expect(exits).toEqual([]);
  });

  test("reloads the current address without a destination", async () => {
    const { exits, location } = recordingLocation();
    expect(await leaveDocument(null, undefined, location)).toBe(true);
    expect(exits).toEqual(["reload"]);
  });
});
