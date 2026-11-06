import { expect, test } from "bun:test";
import { openDesktop } from "./service";

test("desktop handoff services return expected failures without throwing", () => {
  expect(openDesktop("https://evil.test")).toEqual({
    success: false,
    error: { code: "INVALID_INPUT", message: "Invalid desktop destination." },
  });
  expect(openDesktop("/accept-invitation/invite-1")).toEqual({
    success: true,
    data: { link: "startupos://open/accept-invitation/invite-1" },
  });
});
