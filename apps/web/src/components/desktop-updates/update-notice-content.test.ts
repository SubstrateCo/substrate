import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

import { updateNoticeContent } from "./update-notice-content";
import { describe, expect, test } from "bun:test";

const status = (
  install: DesktopUpdateStatus["install"],
  state: DesktopUpdateStatus["state"],
): DesktopUpdateStatus => ({ appVersion: "0.1.0", install, state });

describe("updateNoticeContent", () => {
  test("macOS links to the download, because unsigned builds cannot install updates", () => {
    expect(
      updateNoticeContent(status("manual", { status: "available", version: "0.2.0" }))?.action
        ?.kind,
    ).toBe("download");
  });

  test("Windows offers a restart only once the download is ready", () => {
    expect(
      updateNoticeContent(status("automatic", { status: "available", version: "0.2.0" })),
    ).toBeUndefined();
    expect(
      updateNoticeContent(
        status("automatic", { status: "downloading", version: "0.2.0", percent: 5 }),
      )?.action,
    ).toBeUndefined();
    expect(
      updateNoticeContent(status("automatic", { status: "ready", version: "0.2.0" }))?.action?.kind,
    ).toBe("install");
  });

  test("download progress keeps one notice, so closing it hides the rest of that download", () => {
    const early = updateNoticeContent(
      status("automatic", { status: "downloading", version: "0.2.0", percent: 5 }),
    );
    const late = updateNoticeContent(
      status("automatic", { status: "downloading", version: "0.2.0", percent: 80 }),
    );
    const ready = updateNoticeContent(status("automatic", { status: "ready", version: "0.2.0" }));
    expect(late?.key).toBe(early?.key);
    expect(ready?.key).not.toBe(early?.key);
  });

  test("shows nothing for quiet states or installations that cannot update", () => {
    for (const state of [
      { status: "idle" },
      { status: "checking" },
      { status: "current" },
    ] as const)
      expect(updateNoticeContent(status("automatic", state))).toBeUndefined();
    expect(updateNoticeContent(status("unavailable", { status: "error" }))).toBeUndefined();
  });
});
