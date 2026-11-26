import { createToastSession, type ToastOptions } from "./session";
import { describe, expect, test } from "bun:test";

function setup() {
  const shown: { title: string; options?: ToastOptions }[] = [];
  let dismissals = 0;
  const session = createToastSession({
    success: (title, options) => shown.push({ title, options }),
    error: (title, options) => shown.push({ title, options }),
    dismiss: () => dismissals++,
  });
  return { session, shown, dismissals: () => dismissals };
}

describe("private toast feedback", () => {
  test("does not queue feedback before private Ready or after unmount", () => {
    const { session, shown, dismissals } = setup();
    const beforeReady = session.capture();
    beforeReady.success("Before Ready");
    const unmount = session.mount();
    beforeReady.success("Queued before Ready");
    session.capture().success("Copied");
    unmount();
    session.capture().error("Late failure");
    expect(shown.map((entry) => entry.title)).toEqual(["Copied"]);
    expect(dismissals()).toBe(1);
  });

  test("reset dismisses old feedback and rejects pending results across remount", () => {
    const { session, shown, dismissals } = setup();
    const unmount = session.mount();
    const oldOperation = session.capture();
    oldOperation.success("Copied");
    session.reset();
    unmount();
    session.mount();
    oldOperation.success("Old record");
    oldOperation.error("Old record failed");
    session.capture().success("New account");
    expect(shown.map((entry) => entry.title)).toEqual(["Copied", "New account"]);
    expect(dismissals()).toBe(2);
  });

  test("a stale action cannot run after private reset", () => {
    const { session, shown } = setup();
    let opened = 0;
    session.mount();
    session.capture().success("Linked", {
      description: "Record linked",
      action: { label: "Open", onClick: () => opened++ },
    });
    expect(shown[0]?.options?.description).toBe("Record linked");
    shown[0]?.options?.action?.onClick();
    expect(opened).toBe(1);
    session.reset();
    shown[0]?.options?.action?.onClick();
    expect(opened).toBe(1);
  });
});
