import { homeDeviceLabel, triggersInput } from "./triggers";
import { expect, test } from "bun:test";

test("blank custom prompts save as the default prompt", () => {
  expect(
    triggersInput("agent", [
      { kind: "direct_message", enabled: true, prompt: "  " },
      { kind: "mention", enabled: false, prompt: "  Do {{messages}}  " },
      { kind: "thread_reply", enabled: true, prompt: null },
    ]),
  ).toEqual({
    agentId: "agent",
    triggers: [
      { kind: "direct_message", enabled: true, prompt: null },
      { kind: "mention", enabled: false, prompt: "Do {{messages}}" },
      { kind: "thread_reply", enabled: true, prompt: null },
    ],
  });
});

test.each([
  [null, "No desktop yet"],
  [{ name: "Laptop", online: true, current: true }, "Laptop (this device)"],
  [{ name: "Laptop", online: true, current: false }, "Laptop (online)"],
  [{ name: "Laptop", online: false, current: false }, "Laptop (offline)"],
])("describes the home device %p", (device, label) => {
  expect(homeDeviceLabel(device)).toBe(label);
});
