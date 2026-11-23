import { handleBridge } from "@substrate/contracts/desktop/ipc";
import { channel, methods } from "@substrate/contracts/desktop/window-ipc";

import { googleLinkURL } from "./google-link.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const ticket = "t".repeat(43);
const startURL = `https://api.example.com/api/v1/integrations/google/link/start?ticket=${ticket}`;

test("builds the start page on the configured API origin, ignoring any configured path", () => {
  expect(googleLinkURL({ ticket }, "https://api.example.com")).toBe(startURL);
  expect(googleLinkURL({ ticket }, "https://api.example.com/other/path?x=1")).toBe(startURL);
});

test("opens only well-formed tickets, never a renderer-supplied URL", async () => {
  const opened: string[] = [];
  const dispatch = handleBridge(channel, methods, {
    isFullscreen: () => false,
    setTheme: () => {},
    openGoogleLink: (request) => {
      opened.push(googleLinkURL(request, "https://api.example.com"));
    },
  });
  for (const value of [
    undefined,
    "google",
    { ticket: "https://evil.test" },
    { ticket: `${"t".repeat(42)}/` },
    { ticket: "t".repeat(44) },
    { ticket, url: "https://evil.test" },
  ])
    await rejects(dispatch("openGoogleLink", value));
  expect(opened).toEqual([]);
  await dispatch("openGoogleLink", { ticket });
  expect(opened).toEqual([startURL]);
});
