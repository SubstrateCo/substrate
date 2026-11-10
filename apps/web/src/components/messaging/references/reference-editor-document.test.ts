import {
  referenceDocument,
  referenceDraftText,
  referenceEditorPosition,
} from "./reference-editor-document";
import { WorkspaceReferenceNode } from "./workspace-reference-node";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test } from "bun:test";

test("channel and thread chips round-trip stable IDs and map caret offsets around atomic nodes", () => {
  const channel = "12345678-1234-1234-1234-123456789abc";
  const thread = "12345678-1234-1234-1234-123456789abd";
  const value = `See @[channel:${channel}] and @[thread:${thread}] today`;
  const doc = getSchema([StarterKit, WorkspaceReferenceNode]).nodeFromJSON(
    referenceDocument(value),
  );
  expect(doc.firstChild?.child(1).attrs).toMatchObject({ kind: "channel", id: channel });
  expect(doc.firstChild?.child(3).attrs).toMatchObject({ kind: "thread", id: thread });
  expect(referenceDraftText(doc)).toBe(value);
  const offset = value.indexOf(" and");
  expect(referenceDraftText(doc, referenceEditorPosition(doc, offset))).toBe(
    value.slice(0, offset),
  );
});
