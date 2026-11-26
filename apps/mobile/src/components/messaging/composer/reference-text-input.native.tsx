import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { ReferenceEditorProps } from "./reference-editor-props";
import {
  displayToScalar,
  editorDocument,
  editorDocumentSchema,
  partsFromEditor,
  scalarToDisplay,
} from "@/features/messaging/composer/editor-document";
import { draftIdentity } from "@/features/messaging/references/token-draft";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme";
import {
  createMentionsAddon,
  createNativeEditorDocumentHandle,
  defaultSchema,
  RichTextEditor,
  type RichTextEditorRef,
  withMentionsSchema,
} from "@apollohg/react-native-rich-text-editor";

/** Native void inline nodes. Never round-trip a keystroke through setContent. */
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
  const [handle] = useState(() =>
    createNativeEditorDocumentHandle({
      initialization: { type: "localJson", json: editorDocument(parts), selection: "end" },
      schema: withMentionsSchema(defaultSchema),
    }),
  );
  const [revision, setRevision] = useState<string>();
  const editor = useRef<RichTextEditorRef>(null);
  const identity = useRef(draftIdentity(parts));
  const appliedCaret = useRef(0);
  useEffect(() => () => handle.destroy(), [handle]);

  useLayoutEffect(() => {
    const nextIdentity = draftIdentity(parts);
    const move = caretRequest && caretRequest.id > appliedCaret.current;
    if (nextIdentity === identity.current && !move) return;
    const bridge = handle.bridge;
    if (nextIdentity !== identity.current) {
      bridge.replaceDocument({ setJson: editorDocument(parts), history: "undoableBoundary" });
      identity.current = nextIdentity;
    }
    const documentRevision = bridge.getState().documentRevision;
    if (move) {
      const offset = displayToScalar(parts, caretRequest.caret);
      bridge.setSelection({
        baseDocumentRevision: documentRevision,
        selection: {
          type: "text",
          anchor: { offset, kind: "scalar", affinity: "after" },
          head: { offset, kind: "scalar", affinity: "after" },
        },
      });
      appliedCaret.current = caretRequest.id;
      editor.current?.focus();
    }
    setRevision(documentRevision);
  }, [parts, caretRequest, handle]);

  return (
    <View className={cn("min-h-11 overflow-hidden rounded-2xl", className)}>
      <RichTextEditor
        ref={editor}
        documentHandle={handle}
        documentRevision={revision}
        accessibilityLabel={label}
        placeholder={placeholder}
        editable={editable}
        showToolbar={false}
        pasteMode="plainText"
        heightBehavior="autoGrow"
        style={{ minHeight: 44, maxHeight: 160 }}
        theme={{ text: { color: colors.foreground, fontSize: 15 } }}
        addons={[
          createMentionsAddon({
            theme: {
              node: {
                color: colors.primary,
                backgroundColor: colors.secondary,
                borderRadius: 4,
              },
            },
          }),
        ]}
        onContentChangeJSON={(document) => {
          const next = partsFromEditor(editorDocumentSchema.parse(document));
          identity.current = draftIdentity(next);
          onChange(next);
        }}
        onSelectionChange={(selection) => {
          if (selection.type !== "text" || selection.headScalar === undefined) {
            onCaret(-1);
            return;
          }
          // A selection is not an active picker query.
          onCaret(
            selection.anchorScalar === selection.headScalar
              ? scalarToDisplay(
                  partsFromEditor(editorDocumentSchema.parse(handle.bridge.getDocumentJson())),
                  selection.headScalar,
                )
              : -1,
          );
        }}
      />
    </View>
  );
}
