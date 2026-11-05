import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageMarkdown } from "./message-markdown";

test("message links open separately without access to the workspace window", () => {
  const markup = renderToStaticMarkup(<MessageMarkdown body="[Project](https://example.com)" />);
  expect(markup).toContain('target="_blank"');
  expect(markup).toContain('rel="noopener noreferrer"');
});

test("message images use a text placeholder instead of loading a remote resource", () => {
  const markup = renderToStaticMarkup(
    <MessageMarkdown body="![Launch plan](https://example.com/tracker.png)" />,
  );
  expect(markup).toContain("[Image: Launch plan]");
  expect(markup).not.toContain("<img");
  expect(markup).not.toContain("https://example.com/tracker.png");
});
