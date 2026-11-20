import { outputSegments } from "./sign-in-output";
import { describe, expect, test } from "bun:test";

describe("sign-in output links", () => {
  test("links an https URL and keeps the text around it", () => {
    expect(outputSegments("Open https://claude.ai/oauth?code=1 to continue")).toEqual([
      { text: "Open " },
      { text: "https://claude.ai/oauth?code=1", href: "https://claude.ai/oauth?code=1" },
      { text: " to continue" },
    ]);
  });

  test("leaves sentence punctuation outside the link", () => {
    expect(outputSegments("Visit https://example.com/login.")).toEqual([
      { text: "Visit " },
      { text: "https://example.com/login", href: "https://example.com/login" },
      { text: "." },
    ]);
  });

  test("keeps a closing parenthesis that belongs to the URL", () => {
    const url = "https://en.wikipedia.org/wiki/OAuth_(protocol)";
    expect(outputSegments(url)).toEqual([{ text: url, href: url }]);
  });

  test("does not link other schemes", () => {
    expect(outputSegments("file:///etc/passwd javascript:alert(1)")).toEqual([
      { text: "file:///etc/passwd javascript:alert(1)" },
    ]);
  });

  test("links each URL on its own", () => {
    const segments = outputSegments("a http://one.test b https://two.test");
    expect(segments.filter((segment) => segment.href).map((segment) => segment.href)).toEqual([
      "http://one.test",
      "https://two.test",
    ]);
  });
});
