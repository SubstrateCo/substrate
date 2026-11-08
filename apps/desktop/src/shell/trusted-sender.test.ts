import { trustedSender } from "./trusted-sender.ts";
import { expect, test } from "bun:test";

test("IPC rejects subframes, other windows, and untrusted origins", () => {
  const mainFrame = { url: "https://desktop.example.com/settings" };
  const contents = { mainFrame };
  expect(
    trustedSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(true);
  expect(
    trustedSender(
      { sender: contents, senderFrame: { url: mainFrame.url } },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
  expect(
    trustedSender({ sender: {}, senderFrame: mainFrame }, contents, "https://desktop.example.com"),
  ).toBe(false);
  mainFrame.url = "https://attacker.example.com";
  expect(
    trustedSender(
      { sender: contents, senderFrame: mainFrame },
      contents,
      "https://desktop.example.com",
    ),
  ).toBe(false);
});
