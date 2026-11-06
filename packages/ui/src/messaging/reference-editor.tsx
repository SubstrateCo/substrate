import { createContext, useContext, useImperativeHandle, useLayoutEffect, type Ref } from "react";
import { Node } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { closeHistory } from "@tiptap/pm/history";
import { EntityReference, type WorkspaceReference } from "./entity-reference";
import {
  referenceDocument,
  referenceDraftText,
  referenceEditorPosition,
  referenceToken,
} from "./reference-editor-document";

const ReferencesContext = createContext<WorkspaceReference[]>([]);

function ReferenceNodeView({ node }: NodeViewProps) {
  const references = useContext(ReferencesContext);
  const reference = references.find(
    (item) => item.id === node.attrs.id && item.kind === node.attrs.kind,
  );
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="inline-block max-w-full align-baseline"
      data-reference-chip
    >
      <EntityReference
        reference={
          reference ? { id: reference.id, kind: reference.kind, label: reference.label } : undefined
        }
      />
    </NodeViewWrapper>
  );
}

const WorkspaceReferenceNode = Node.create({
  name: "workspaceReference",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ kind: { default: "person" }, id: { default: "" } }),
  renderHTML: () => ["span", {}, "Workspace reference"],
  renderText: ({ node }) => referenceToken(node),
  addNodeView: () => ReactNodeViewRenderer(ReferenceNodeView),
});

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
}) {
  const attributes = {
    role: "textbox",
    "aria-label": label,
    "aria-multiline": "true",
    "aria-autocomplete": "list",
    "aria-describedby": descriptionId ?? "",
    "aria-controls": listId ?? "",
    "aria-activedescendant": activeDescendant ?? "",
    class:
      "min-h-24 max-h-64 overflow-y-auto px-3 py-2 text-sm whitespace-pre-wrap wrap-anywhere outline-none [&_p]:m-0",
  };
  const editor = useEditor({
    extensions,
    content: referenceDocument(value),
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes,
      handleKeyDown: (_view, event) => {
        onKeyDown(event);
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

  useImperativeHandle(
    ref,
    () => ({
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
