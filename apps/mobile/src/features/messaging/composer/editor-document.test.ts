import {
  displayToDocument,
  displayToScalar,
  documentToDisplay,
  editorDocument,
  editorDocumentSchema,
  partsFromEditor,
  scalarToDisplay,
} from "./editor-document";
import {
  activeReferenceQuery,
  bodyFromParts,
  displayText,
  insertReference,
  type DraftPart,
} from "@/features/messaging/references/token-draft";
import { describe, expect, test } from "bun:test";

const id = "12345678-1234-1234-1234-123456789abc";
const person: DraftPart = { type: "reference", kind: "person", id, label: "Ada" };
const channel: DraftPart = { type: "reference", kind: "channel", id, label: "Ada" };

describe("editor message boundary", () => {
  test("round-trips same-label references by kind and ID, never by their text", () => {
    const parts: DraftPart[] = [
      { type: "text", text: "Hi 😀\n" },
      person,
      { type: "text", text: " and " },
      channel,
      { type: "text", text: "\n\nend\n" },
    ];
    const decoded = partsFromEditor(editorDocument(parts));
    expect(decoded).toEqual(parts);
    expect(bodyFromParts(decoded)).toBe(`Hi 😀\n@[person:${id}] and @[channel:${id}]\n\nend\n`);
  });

  test("keeps labels and token-looking code literal in text nodes", () => {
    const parts: DraftPart[] = [{ type: "text", text: "`@Ada` @[person:not-an-id] <x>&" }];
    expect(partsFromEditor(editorDocument(parts))).toEqual(parts);
    expect(activeReferenceQuery(partsFromEditor(editorDocument(parts)), 5)).toBeNull();
  });

  test.each([
    { kind: "person", id: "bad", label: "Ada" },
    { kind: "admin", id, label: "Owner" },
  ])("rejects invalid reference identity %j without converting it to text", (attrs) => {
    expect(() =>
      editorDocumentSchema.parse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "mention", attrs }],
          },
        ],
      }),
    ).toThrow();
  });

  test("empty and trailing empty paragraphs preserve draft line breaks", () => {
    expect(partsFromEditor(editorDocument([]))).toEqual([]);
    expect(partsFromEditor(editorDocument([{ type: "text", text: "\n\n" }]))).toEqual([
      { type: "text", text: "\n\n" },
    ]);
  });

  test("decodes pasted mention metadata without requiring a private display-label field", () => {
    expect(
      partsFromEditor(
        editorDocumentSchema.parse({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "mention",
                  attrs: { kind: "channel", id, label: "#team" },
                },
              ],
            },
          ],
        }),
      ),
    ).toEqual([{ type: "reference", kind: "channel", id, label: "team" }]);
  });
});

describe("editor selection boundary", () => {
  const parts: DraftPart[] = [{ type: "text", text: "😀\n" }, person, { type: "text", text: " x" }];

  test("native scalar selection counts emoji and atomic nodes once", () => {
    expect(displayToScalar(parts, 3)).toBe(2);
    expect(displayToScalar(parts, 7)).toBe(3);
    expect(scalarToDisplay(parts, 2)).toBe(3);
    expect(scalarToDisplay(parts, 3)).toBe(7);
    expect(scalarToDisplay(parts, 5)).toBe(9);
  });

  test("web document selection includes paragraph boundaries and UTF-16 text", () => {
    expect(displayToDocument(parts, 3)).toBe(5);
    expect(displayToDocument(parts, 7)).toBe(6);
    expect(documentToDisplay(parts, 5)).toBe(3);
    expect(documentToDisplay(parts, 6)).toBe(7);
    expect(documentToDisplay(parts, 8)).toBe(9);
  });

  test("maps every valid caret boundary back without entering a reference", () => {
    for (const caret of [0, 2, 3, 7, 8, 9]) {
      expect(scalarToDisplay(parts, displayToScalar(parts, caret))).toBe(caret);
      expect(documentToDisplay(parts, displayToDocument(parts, caret))).toBe(caret);
    }
  });

  test("picker insertion restores the caret after a structured reference and space", () => {
    const typed: DraftPart[] = [{ type: "text", text: "😀 @Ad" }];
    const query = activeReferenceQuery(typed, displayText(typed).length)!;
    const inserted = insertReference(typed, query, { kind: "person", id, label: "Ada" });
    const decoded = partsFromEditor(editorDocument(inserted.parts));
    expect(bodyFromParts(decoded)).toBe(`😀 @[person:${id}] `);
    expect(scalarToDisplay(decoded, displayToScalar(decoded, inserted.caret))).toBe(8);
    expect(documentToDisplay(decoded, displayToDocument(decoded, inserted.caret))).toBe(8);
    expect(activeReferenceQuery(decoded, inserted.caret)).toBeNull();
  });

  test("removing a mention node removes only its exact token", () => {
    const document = editorDocument([person, { type: "text", text: " " }, channel]);
    document.content[0]!.content.splice(0, 1);
    expect(bodyFromParts(partsFromEditor(document))).toBe(` @[channel:${id}]`);
  });
});
