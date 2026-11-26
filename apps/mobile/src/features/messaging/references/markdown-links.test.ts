import { openableLink } from "./markdown-links";
import { expect, test } from "bun:test";

test("message links open only web and mail addresses", () => {
  expect(openableLink("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  expect(openableLink("mailto:ada@example.com")).toBe("mailto:ada@example.com");
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "substrate://open",
    "/relative/path",
    "not a url",
  ])
    expect(openableLink(href)).toBeUndefined();
});
