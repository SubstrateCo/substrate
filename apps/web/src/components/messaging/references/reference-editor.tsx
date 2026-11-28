import { useImperativeHandle, useLayoutEffect, type Ref } from "react";

import {
  referenceDocument,
  referenceDraftText,
  referenceEditorPosition,
} from "./reference-editor-document";
import { pastedFiles } from "@/components/attachments/pasted-files";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { ReferencesContext } from "@/components/messaging/references/references-context";
import { WorkspaceReferenceNode } from "@/components/messaging/references/workspace-reference-node";
import { referenceKey } from "@/lib/messaging/reference-token";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const extensions = [
  StarterKit.configure({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    underline: false,
    link: false,
    heading: false,
    blockquote: false,
    codeBlock: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    horizontalRule: false,
    trailingNode: false,
  }),
  WorkspaceReferenceNode,
];

export type ReferenceEditorHandle = {
  focusAt: (caret: number) => void;
  focusRange: (start: number, end: number) => void;
  getSelection: () => { start: number; end: number };
};

export function ReferenceEditor({
  ref,
  value,
  references,
  label,
  onChange,
  onSelectionChange,
  onKeyDown,
  onPasteFiles,
  disabled = false,
  listId,
  activeOptionId,
}: {
  ref?: Ref<ReferenceEditorHandle>;
  value: string;
  references: WorkspaceReference[];
  label: string;
  onChange: (value: string, caret: number) => void;
  onSelectionChange: (caret: number) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onPasteFiles?: (files: File[]) => void;
  disabled?: boolean;
  listId?: string;
  activeOptionId?: string;
}) {
  const editor = useEditor({
    extensions,
    editable: !disabled,
    content: referenceDocument(value),
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "data-slot": "input-group-control",
        "aria-label": label,
        "aria-multiline": "true",
        "aria-autocomplete": "list",
        class:
          "min-h-8 max-h-[25dvh] overflow-y-auto px-3 py-1 text-sm whitespace-pre-wrap wrap-anywhere outline-none [&_p]:m-0",
      },
      handleKeyDown: (view, event) => {
        onKeyDown(event);
        const ctrlOnly = event.ctrlKey && !event.altKey && !event.isComposing;
        const boundaryKey = event.key === "Home" || event.key === "End";
        if (!event.defaultPrevented && ctrlOnly && boundaryKey) {
          // Native Home selection can be mistaken for a browser reset just after focus.
          const { doc, selection, tr } = view.state;
          const target = event.key === "Home" ? Selection.atStart(doc) : Selection.atEnd(doc);
          view.dispatch(
            tr
              .setSelection(
                event.shiftKey ? TextSelection.create(doc, selection.anchor, target.head) : target,
              )
              .scrollIntoView(),
          );
          return true;
        }
        return event.defaultPrevented;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const files = onPasteFiles
          ? pastedFiles({ files: Array.from(event.clipboardData?.files ?? []), text })
          : [];
        if (files.length) {
          event.preventDefault();
          onPasteFiles?.(files);
          return true;
        }
        if (!text) return false;
        event.preventDefault();
        // An open slice joins the first and last pasted lines to the text around the caret.
        // Closed paragraphs would split the current line where the caret is.
        const { schema, tr } = view.state;
        const lines = Fragment.fromJSON(schema, referenceDocument(text).content);
        view.dispatch(tr.replaceSelection(new Slice(lines, 1, 1)).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(
        referenceDraftText(current.state.doc),
        referenceDraftText(current.state.doc, current.state.selection.from).length,
      );
    },
    onSelectionUpdate: ({ editor: current }) => {
      onSelectionChange(referenceDraftText(current.state.doc, current.state.selection.from).length);
    },
  });

  useLayoutEffect(() => {
    if (referenceDraftText(editor.state.doc) !== value) {
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.commands.setContent(referenceDocument(value), { emitUpdate: false });
      editor.view.dispatch(closeHistory(editor.state.tr));
    }
  }, [editor, value]);

  useLayoutEffect(() => {
    editor.setEditable(!disabled, false);
  }, [editor, disabled]);

  useLayoutEffect(() => {
    const element = editor.view.dom;
    if (listId) element.setAttribute("aria-controls", listId);
    else element.removeAttribute("aria-controls");
    if (activeOptionId) element.setAttribute("aria-activedescendant", activeOptionId);
    else element.removeAttribute("aria-activedescendant");
  }, [editor, listId, activeOptionId]);

  const referencesByKey = new Map(
    references.map((item) => [referenceKey(item.kind, item.id), item] as const),
  );

  useImperativeHandle(
    ref,
    () => ({
      getSelection: () => ({
        start: referenceDraftText(editor.state.doc, editor.state.selection.from).length,
        end: referenceDraftText(editor.state.doc, editor.state.selection.to).length,
      }),
      focusRange: (start, end) => {
        editor.commands.setTextSelection({
          from: referenceEditorPosition(editor.state.doc, start),
          to: referenceEditorPosition(editor.state.doc, end),
        });
        editor.view.focus();
      },
      focusAt: (caret) => {
        editor.commands.setTextSelection(referenceEditorPosition(editor.state.doc, caret));
        editor.view.focus();
      },
    }),
    [editor],
  );

  return (
    <ReferencesContext value={referencesByKey}>
      <EditorContent editor={editor} />
    </ReferencesContext>
  );
}
