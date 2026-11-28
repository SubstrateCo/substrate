import { useLayoutEffect, useRef, type CSSProperties } from "react";

import type { ReferenceEditorProps } from "./reference-editor-props";
import {
  displayToDocument,
  documentToDisplay,
  editorDocument,
  editorDocumentSchema,
  partsFromEditor,
} from "@/features/messaging/composer/editor-document";
import { draftIdentity } from "@/features/messaging/references/token-draft";
import { useTheme } from "@/theme";
import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: null },
      id: { default: null },
      label: { default: "" },
      referenceLabel: { default: null },
      mentionSuggestionChar: { default: "@" },
    };
  },
  parseHTML: () => [{ tag: "span[data-reference-chip]" }],
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-reference-chip": "",
        contenteditable: "false",
      }),
      String(node.attrs.label),
    ];
  },
  addKeyboardShortcuts() {
    const remove = (direction: -1 | 1) => {
      const { selection } = this.editor.state;
      if (!selection.empty) return false;
      const neighbor = direction === -1 ? selection.$from.nodeBefore : selection.$from.nodeAfter;
      if (neighbor?.type.name !== "mention") return false;
      return this.editor.commands.deleteRange({
        from: selection.from - (direction === -1 ? neighbor.nodeSize : 0),
        to: selection.to + (direction === 1 ? neighbor.nodeSize : 0),
      });
    };
    return {
      Backspace: () => remove(-1),
      Delete: () => remove(1),
      "Shift-Enter": () => this.editor.commands.splitBlock(),
    };
  },
});

export function ReferenceTextInput({
  parts,
  label,
  placeholder,
  editable,
  caretRequest,
  className,
  onChange,
  onCaret,
}: ReferenceEditorProps) {
  const { colors } = useTheme();
  const callbacks = useRef({ onChange, onCaret });
  useLayoutEffect(() => {
    callbacks.current = { onChange, onCaret };
  }, [onChange, onCaret]);
  const identity = useRef(draftIdentity(parts));
  const appliedCaret = useRef(0);
  const instance = useRef<Editor | null>(null);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          blockquote: false,
          bold: false,
          bulletList: false,
          code: false,
          codeBlock: false,
          hardBreak: false,
          heading: false,
          horizontalRule: false,
          italic: false,
          link: false,
          listItem: false,
          listKeymap: false,
          orderedList: false,
          strike: false,
          underline: false,
        }),
        Mention,
      ],
      content: editorDocument(parts),
      editable,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true" },
        handlePaste(_view, event) {
          const text = event.clipboardData?.getData("text/plain");
          if (text === undefined || !instance.current) return false;
          event.preventDefault();
          instance.current.commands.insertContent(
            editorDocument([{ type: "text", text: text.replace(/\r\n?/g, "\n") }]).content,
          );
          return true;
        },
      },
      onUpdate({ editor }) {
        const next = partsFromEditor(editorDocumentSchema.parse(editor.getJSON()));
        identity.current = draftIdentity(next);
        callbacks.current.onChange(next);
      },
      onSelectionUpdate({ editor }) {
        const next = partsFromEditor(editorDocumentSchema.parse(editor.getJSON()));
        callbacks.current.onCaret(
          editor.state.selection.empty ? documentToDisplay(next, editor.state.selection.head) : -1,
        );
      },
    },
    [],
  );
  useLayoutEffect(() => {
    instance.current = editor;
  }, [editor]);

  useLayoutEffect(() => {
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  useLayoutEffect(() => {
    const changed = draftIdentity(parts) !== identity.current;
    const move = caretRequest && caretRequest.id > appliedCaret.current;
    if (!changed && !move) return;
    const chain = editor.chain();
    if (changed) {
      identity.current = draftIdentity(parts);
      chain.setContent(editorDocument(parts), { emitUpdate: false });
    }
    if (move) {
      chain.setTextSelection(displayToDocument(parts, caretRequest.caret));
      chain.focus(undefined, { scrollIntoView: false });
      appliedCaret.current = caretRequest.id;
    }
    chain.run();
  }, [editor, parts, caretRequest]);

  const style: CSSProperties & { "--chip-color": string; "--chip-background": string } = {
    minHeight: 44,
    maxHeight: 160,
    overflowY: "auto",
    padding: "10px 12px",
    color: colors.foreground,
    fontSize: 15,
    lineHeight: "20px",
    "--chip-color": colors.primary,
    "--chip-background": colors.secondary,
  };
  return (
    <div className={className} data-reference-editor="" style={style}>
      <style>{`
        [data-reference-editor] .tiptap { outline: none; min-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; }
        [data-reference-editor] .tiptap p { margin: 0; }
        [data-reference-editor] [data-reference-chip] { color: var(--chip-color); background: var(--chip-background); border-radius: 4px; padding: 1px 3px; }
        [data-reference-editor] .ProseMirror-selectednode { outline: 1px solid var(--chip-color); }
      `}</style>
      {editor.isEmpty ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            color: colors["muted-foreground"],
            pointerEvents: "none",
          }}
        >
          {placeholder}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
