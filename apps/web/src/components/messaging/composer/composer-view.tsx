import { useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Field } from "../../ui/field";
import { InputGroup, InputGroupAddon } from "../../ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import type { WorkspaceReference } from "../references/entity-reference";
import { ReferenceEditor } from "../references/reference-editor";
import { referenceQuery } from "../references/reference-query";
import type { ReferenceQuery } from "../references/reference-query";
import { ComposerDraftReferences } from "./composer-drafts";
import { ComposerToolbar } from "./composer-toolbar";
import { EmojiPicker } from "./emoji-picker";
import { useComposerDraft } from "@/components/messaging/composer/composer/use-composer-draft";
import { Send } from "lucide-react";

export function Composer({
  onSend,
  pending = false,
  error,
  label,
  defaultValue = "",
  draftKey,
  renderReferences,
}: {
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  defaultValue?: string;
  draftKey?: string;
  renderReferences?: (
    query: ReferenceQuery,
    onInsert: (token: string, reference: WorkspaceReference) => void,
    onClose: () => void,
  ) => ReactNode;
}) {
  const { draft, setDraft, editor, setComposing, isComposing, submit, insert, requestFocus } =
    useComposerDraft({
      draftKey,
      defaultValue,
      pending,
      onSend,
    });
  const [references, setReferences] = useState(false);
  const [caret, setCaret] = useState(draft.length);
  const draftReferences = useContext(ComposerDraftReferences);
  const [localReferences, setLocalReferences] = useState<WorkspaceReference[]>([]);
  const resolvedReferences =
    (draftKey ? draftReferences?.get(draftKey) : undefined) ?? localReferences;
  const anchor = useRef<HTMLDivElement>(null);
  const activeReference = referenceQuery(draft, caret);
  const referencePicker = useRef<HTMLDivElement>(null);
  const closeReferences = () => {
    setReferences(false);
  };
  const insertReference = (token: string, reference: WorkspaceReference) => {
    if (!activeReference) return;
    const nextReferences = [
      ...resolvedReferences.filter(
        (item) => item.id !== reference.id || item.kind !== reference.kind,
      ),
      reference,
    ];
    if (draftKey) draftReferences?.set(draftKey, nextReferences);
    setLocalReferences(nextReferences);
    const nextCaret = activeReference.start + token.length + 1;
    requestFocus(nextCaret);
    setCaret(nextCaret);
    setDraft(
      draft.slice(0, activeReference.start) + token + " " + draft.slice(activeReference.end),
    );
    closeReferences();
  };
  return (
    <form
      className="relative space-y-2 p-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field>
        <Popover open={references && !!renderReferences} onOpenChange={setReferences}>
          <InputGroup variant="composer" className="overflow-hidden">
            <InputGroupAddon align="block-start" className="[&>div]:w-full">
              <ComposerToolbar pending={pending} onInsert={insert} />
            </InputGroupAddon>
            <PopoverAnchor asChild>
              <div
                ref={anchor}
                data-slot="input-group-control"
                className="w-full min-w-0"
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              >
                <ReferenceEditor
                  ref={editor}
                  label={label}
                  value={draft}
                  references={resolvedReferences}
                  disabled={pending}
                  onChange={(value, position) => {
                    setDraft(value);
                    setCaret(position);
                    if (!isComposing()) setReferences(!!referenceQuery(value, position));
                  }}
                  onSelectionChange={(position) => {
                    setCaret(position);
                    if (!referenceQuery(draft, position)) closeReferences();
                  }}
                  onKeyDown={(event) => {
                    if (event.isComposing || isComposing()) return;
                    if (references && renderReferences && !event.shiftKey) {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeReferences();
                        return;
                      }
                      if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
                        event.preventDefault();
                        referencePicker.current
                          ?.querySelector<HTMLInputElement>('[role="combobox"]')
                          ?.focus();
                        return;
                      }
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </div>
            </PopoverAnchor>
            {references && activeReference && renderReferences && (
              <PopoverContent
                ref={referencePicker}
                variant="reference"
                className="max-h-(--radix-popover-content-available-height)"
                aria-label="Workspace references"
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (document.activeElement === document.body) editor.current?.focusAt(caret);
                }}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  closeReferences();
                }}
                onInteractOutside={(event) => {
                  if (event.target instanceof Node && anchor.current?.contains(event.target))
                    event.preventDefault();
                }}
              >
                {renderReferences(activeReference, insertReference, () => {
                  closeReferences();
                  requestFocus(caret);
                })}
              </PopoverContent>
            )}
            <InputGroupAddon align="block-end" className="justify-between">
              <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
              <PendingButton
                type="submit"
                size="sm"
                className="min-w-16"
                disabled={!draft.trim() || draft.length > 20000}
                pending={pending}
                pendingLabel="Sending…"
              >
                <Send className="size-3.5" />
                Send
              </PendingButton>
            </InputGroupAddon>
          </InputGroup>
        </Popover>
        <FormMessage
          error={error}
          errorDescription="Your message couldn’t be sent. Your draft is still here. Try sending it again."
        />
      </Field>
    </form>
  );
}
