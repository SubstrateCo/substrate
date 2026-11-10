import { useContext, useId, useRef, useState } from "react";
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
import { ComposerToolbar, composerFormats } from "./composer-toolbar";
import { EmojiPicker } from "./emoji-picker";
import {
  messageMaxLength,
  useComposerDraft,
} from "@/components/messaging/composer/use-composer-draft";
import { cn } from "cn";
import { Send } from "lucide-react";

export function Composer({
  onSend,
  pending = false,
  error,
  label,
  draftKey,
  renderReferences,
}: {
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  draftKey: string;
  renderReferences?: (
    query: ReferenceQuery,
    onInsert: (token: string, reference: WorkspaceReference) => void,
    onClose: () => void,
  ) => ReactNode;
}) {
  const { draft, setDraft, editor, setComposing, isComposing, submit, insert, requestFocus } =
    useComposerDraft({
      draftKey,
      pending,
      onSend,
    });
  const limitId = useId();
  const [references, setReferences] = useState(false);
  const [caret, setCaret] = useState(draft.length);
  const draftReferences = useContext(ComposerDraftReferences);
  if (!draftReferences) throw new Error("Composer requires ComposerDraftProvider");
  const [localReferences, setLocalReferences] = useState(() => ({
    key: draftKey,
    items: draftReferences.get(draftKey) ?? [],
  }));
  const resolvedReferences =
    localReferences.key === draftKey
      ? localReferences.items
      : (draftReferences.get(draftKey) ?? []);
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
    draftReferences.set(draftKey, nextReferences);
    setLocalReferences({ key: draftKey, items: nextReferences });
    const nextCaret = activeReference.start + token.length + 1;
    requestFocus(nextCaret);
    setCaret(nextCaret);
    setDraft(
      draft.slice(0, activeReference.start) + token + " " + draft.slice(activeReference.end),
    );
    closeReferences();
  };
  const overBy = draft.length - messageMaxLength;
  const nearLimit = draft.length > messageMaxLength - 1000;
  return (
    <form
      className="@container relative p-3 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field>
        <Popover open={references && !!renderReferences} onOpenChange={setReferences}>
          <InputGroup variant="composer" className="group/composer overflow-hidden">
            <PopoverAnchor asChild>
              <div
                ref={anchor}
                data-slot="input-group-control"
                className="relative w-full min-w-0"
                onCompositionStart={() => setComposing(true)}
                onCompositionEnd={() => setComposing(false)}
              >
                {!draft && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-2 truncate text-sm text-muted-foreground"
                  >
                    {label}
                  </span>
                )}
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
                    const shortcut =
                      (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
                        ? composerFormats.find((format) => format.key === event.key.toLowerCase())
                        : undefined;
                    if (shortcut) {
                      event.preventDefault();
                      insert(shortcut.prefix, shortcut.suffix);
                      return;
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
            <InputGroupAddon align="block-end">
              <div className="-ml-1 flex w-full min-w-0 items-center gap-0.5">
                <ComposerToolbar pending={pending} onInsert={insert} />
                <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
                <span className="ml-auto flex min-w-0 items-center gap-3 pl-2">
                  {nearLimit && (
                    <span
                      id={limitId}
                      aria-live="polite"
                      className={cn(
                        "truncate text-xs font-normal tabular-nums",
                        overBy > 0 ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {overBy > 0
                        ? `Remove ${overBy.toLocaleString("en-US")} ${overBy === 1 ? "character" : "characters"} to send`
                        : `${(messageMaxLength - draft.length).toLocaleString("en-US")} characters left`}
                    </span>
                  )}
                  {!nearLimit && (
                    <span className="hidden truncate text-xs font-normal text-muted-foreground opacity-0 transition-opacity group-focus-within/composer:opacity-100 motion-reduce:transition-none @lg:inline">
                      <strong className="font-medium">Enter</strong> to send ·{" "}
                      <strong className="font-medium">Shift+Enter</strong> for a new line ·{" "}
                      <strong className="font-medium">@</strong> to reference
                    </span>
                  )}
                  <PendingButton
                    type="submit"
                    size="sm"
                    className="min-w-16"
                    aria-describedby={nearLimit ? limitId : undefined}
                    disabled={!draft.trim() || overBy > 0}
                    pending={pending}
                    pendingLabel="Sending…"
                  >
                    <Send className="size-3.5" />
                    Send
                  </PendingButton>
                </span>
              </div>
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
