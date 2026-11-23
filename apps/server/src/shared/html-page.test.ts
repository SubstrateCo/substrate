import { htmlPage, htmlPageCSP } from "./html-page";
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";

test("the page's only stylesheet is the one its CSP allows, and its text is escaped", async () => {
  const page = String(
    await htmlPage({
      title: "Title <b>",
      paragraphs: ["Body"],
      actions: [{ label: "Go", href: 'substrate://open/x"onclick="y', primary: true }],
    }),
  );
  const styles = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
  expect(styles).toHaveLength(1);
  const hash = createHash("sha256")
    .update(styles[0] ?? "")
    .digest("base64");
  expect(htmlPageCSP).toBe(
    `default-src 'none'; style-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  expect(page).not.toContain("<b>");
  expect(page).not.toContain('"onclick="');
});
