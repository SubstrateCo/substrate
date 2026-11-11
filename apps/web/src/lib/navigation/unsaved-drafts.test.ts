import {
  confirmDiscardDrafts,
  leaveDocument,
  registerUnsavedDraft,
  unsavedDraftNames,
} from "./unsaved-drafts";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

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
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const location = { assign: mock((_url: string) => {}), reload: mock(() => {}) };
  beforeAll(() => {
    // leaveDocument reads only window.location.
    Object.defineProperty(globalThis, "window", { value: { location }, configurable: true });
  });
  afterAll(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  afterEach(() => {
    location.assign.mockClear();
    location.reload.mockClear();
  });

  test("stays, without preparing, when the person keeps editing", async () => {
    const prepare = mock(() => Promise.resolve());
    const unregister = registerUnsavedDraft(() => Promise.resolve(false));

    expect(await leaveDocument("/login", prepare)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(location.assign).not.toHaveBeenCalled();
    unregister();
  });

  test("prepares, then loads the destination after the person agrees", async () => {
    const steps: string[] = [];
    location.assign.mockImplementation((url) => void steps.push(url));
    const unregister = registerUnsavedDraft(() => Promise.resolve(true));

    expect(await leaveDocument("/login", async () => void steps.push("prepare"))).toBe(true);
    expect(steps).toEqual(["prepare", "/login"]);
    unregister();
  });

  test("stays when preparing fails", async () => {
    const outcome = await leaveDocument("/login", () => Promise.reject(new Error("offline"))).catch(
      (error: Error) => error,
    );
    expect(outcome).toMatchObject({ message: "offline" });
    expect(location.assign).not.toHaveBeenCalled();
  });

  test("reloads the current address without a destination", async () => {
    expect(await leaveDocument(null)).toBe(true);
    expect(location.reload).toHaveBeenCalledTimes(1);
  });
});
