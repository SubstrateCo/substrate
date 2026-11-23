import { plainTextDescription } from "./description";
import { expect, test } from "bun:test";

test("an HTML description becomes plain text with its line breaks and list items", () => {
  expect(
    plainTextDescription(
      "<p>Agenda:</p><ul><li>Pricing</li><li>Next&nbsp;steps</li></ul>Dial in<br>+1 555&#x2011;0100",
    ),
  ).toBe("Agenda:\n\n• Pricing\n• Next steps\nDial in\n+1 555‑0100");
});

test("scripts, styles, comments, and attributes never reach the text", () => {
  const text = plainTextDescription(
    '<script>alert(1)</script><style>p{}</style><!-- note --><a href="javascript:x" onclick="y">Join</a> &lt;b&gt;',
  );
  expect(text).toBe("Join <b>");
});

test("plain text keeps its own line breaks and loses runs of blank lines", () => {
  expect(plainTextDescription("Line one\r\n\r\n\r\n\r\nLine two  \n")).toBe("Line one\n\nLine two");
  expect(plainTextDescription(null)).toBe("");
});
