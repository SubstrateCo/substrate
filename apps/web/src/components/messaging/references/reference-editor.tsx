import { useImperativeHandle, useLayoutEffect, useMemo, type Ref } from "react";

import {
  referenceDocument,
  referenceDraftText,
  referenceEditorPosition,
} from "./reference-editor-document";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferencesContext,
  WorkspaceReferenceNode,
} from "@/components/messaging/references/reference-editor/workspace-reference-node";
import { closeHistory } from "@tiptap/pm/history";
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
  descriptionId,
  listId,
  activeDescendant,
  onChange,
  onSelectionChange,
  onKeyDown,
  disabled = false,
}: {
  ref?: Ref<ReferenceEditorHandle>;
  value: string;
  references: WorkspaceReference[];
  label: string;
  descriptionId?: string;
  listId?: string;
  activeDescendant?: string;
  onChange: (value: string, caret: number) => void;
  onSelectionChange: (caret: number) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  disabled?: boolean;
}) {
  const attributes = useMemo(
    () => ({
      role: "textbox",
      "aria-label": label,
      "aria-multiline": "true",
      "aria-autocomplete": "list",
      "aria-describedby": descriptionId ?? "",
      "aria-controls": listId ?? "",
      "aria-activedescendant": activeDescendant ?? "",
      class:
        "min-h-10 max-h-[25dvh] overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere outline-none [&_p]:m-0",
    }),
    [label, descriptionId, listId, activeDescendant],
  );
  const editor = useEditor({
    extensions,
    editable: !disabled,
    content: referenceDocument(value),
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes,
      handleKeyDown: (view, event) => {
        onKeyDown(event);
        if (
          !event.defaultPrevented &&
          !event.isComposing &&
          event.ctrlKey &&
          !event.altKey &&
          (event.key === "Home" || event.key === "End")
        ) {
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
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;
        event.preventDefault();
        editor.commands.insertContent(referenceDocument(text).content ?? []);
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
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes } });
  }, [editor, attributes]);

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
    <ReferencesContext value={references}>
      <EditorContent editor={editor} />
    </ReferencesContext>
  );
}
