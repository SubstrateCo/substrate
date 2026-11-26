import { useContext, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
import type { WorkspaceReference } from "../references/entity-reference";
import { ReferenceEditor } from "../references/reference-editor";
import {
  ReferencePickerLink,
  type ReferencePickerHandle,
} from "../references/reference-picker-context";
import { referenceQuery } from "../references/reference-query";
import type { ReferenceQuery } from "../references/reference-query";
import { ComposerDraftReferences } from "./composer-draft-context";
import { composerFormats } from "./composer-formats";
import { ComposerToolbar } from "./composer-toolbar";
import { EmojiPicker } from "./emoji-picker";
import { FormMessage } from "@/components/feedback/form-message";
import {
  messageMaxLength,
  useComposerDraft,
} from "@/components/messaging/composer/use-composer-draft";
import { Field } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "cn";
import { Send } from "lucide-react";

export function Composer({
  onSend,
  pending = false,
  error,
  label,
  draftKey,
  renderReferences,
  attachmentControls,
  attachmentDrafts,
  onPasteFiles,
  hasAttachments = false,
  attachmentsReady = true,
  submitLabel = "Send",
  errorDescription = "Your message couldn’t be sent. Try sending it again.",
  submitDisabled = false,
  secondaryAction,
  autoFocus = false,
  onCancel,
  className,
}: {
  /** Called on Escape when no picker is open, such as to stop editing. */
  onCancel?: () => void;
  className?: string;
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  draftKey: string;
  submitLabel?: string;
  errorDescription?: string;
  /** Blocks submitting a draft that is otherwise sendable, such as an unchanged edit. */
  submitDisabled?: boolean;
  /** Shown before the submit button, such as Cancel. */
  secondaryAction?: ReactNode;
  autoFocus?: boolean;
  attachmentControls?: ReactNode;
  attachmentDrafts?: ReactNode;
  /** Attaches files pasted into the editor, such as a screenshot. */
  onPasteFiles?: (files: File[]) => void;
  hasAttachments?: boolean;
  attachmentsReady?: boolean;
  renderReferences?: (
    query: ReferenceQuery,
    onInsert: (token: string, reference: WorkspaceReference) => void,
  ) => ReactNode;
}) {
  const {
    draft,
    setDraft,
    editor,
    setComposing,
    isComposing,
    canSend,
    submit,
    insert,
    requestFocus,
  } = useComposerDraft({
    draftKey,
    pending,
    onSend,
    hasAttachments,
    attachmentsReady,
    submitDisabled,
    autoFocus,
  });
  const [references, setReferences] = useState(false);
  // Where the reference query that the person dismissed starts. It stays closed while they keep
  // typing that query, and opens again for a new one.
  const [dismissedAt, setDismissedAt] = useState<number>();
  const pickerListId = useId();
  const picker = useRef<ReferencePickerHandle>(null);
  const [activeOptionId, setActiveOptionId] = useState<string>();
  const [caret, setCaret] = useState(draft.length);
  const draftReferences = useContext(ComposerDraftReferences);
  if (!draftReferences) throw new Error("Composer requires ComposerDraftProvider");
  // Callers key the composer by draft, so the draft key never changes while it is mounted.
  const [resolvedReferences, setResolvedReferences] = useState(
    () => draftReferences.get(draftKey) ?? [],
  );
  const anchor = useRef<HTMLDivElement>(null);
  const activeReference = referenceQuery(draft, caret);
  const pickerOpen = references && !!activeReference && !!renderReferences;
  const closeReferences = () => {
    setReferences(false);
  };
  const dismissReferences = () => {
    if (activeReference) setDismissedAt(activeReference.start);
    closeReferences();
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
    setResolvedReferences(nextReferences);
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
      className={cn("@container relative w-full p-3 pt-1", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field>
        <Popover open={references && !!renderReferences} onOpenChange={setReferences}>
          <div className={cn("w-full rounded-lg", hasAttachments && "shadow-floating")}>
            <InputGroup variant="composer" className="overflow-hidden">
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
                      className="pointer-events-none absolute inset-x-3 top-1 truncate text-sm text-muted-foreground"
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
                    onPasteFiles={onPasteFiles}
                    listId={pickerOpen ? pickerListId : undefined}
                    activeOptionId={pickerOpen ? activeOptionId : undefined}
                    onChange={(value, position) => {
                      setDraft(value);
                      setCaret(position);
                      const next = referenceQuery(value, position);
                      const dismissed = next?.start === dismissedAt;
                      if (!dismissed) setDismissedAt(undefined);
                      if (!isComposing()) setReferences(!!next && !dismissed);
                    }}
                    onSelectionChange={(position) => {
                      setCaret(position);
                      if (!referenceQuery(draft, position)) closeReferences();
                    }}
                    onKeyDown={(event) => {
                      if (event.isComposing || isComposing()) return;
                      const modified = event.altKey || event.ctrlKey || event.metaKey;
                      if (pickerOpen && !modified) {
                        // Left and Right stay text editing. Tab switches the picker's tab, as its
                        // footer shows; after Escape, Tab moves focus as usual.
                        if (event.key === "Tab") {
                          event.preventDefault();
                          picker.current?.cycle(event.shiftKey ? -1 : 1);
                          return;
                        }
                        if (!event.shiftKey && event.key === "Escape") {
                          event.preventDefault();
                          dismissReferences();
                          return;
                        }
                        if (!event.shiftKey && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                          event.preventDefault();
                          picker.current?.move(event.key === "ArrowDown" ? 1 : -1);
                          return;
                        }
                        if (!event.shiftKey && event.key === "Enter") {
                          if (picker.current?.choose() !== false) {
                            event.preventDefault();
                            return;
                          }
                          // Nothing to insert: close the picker and let Enter send.
                          dismissReferences();
                        }
                      }
                      if (event.key === "Escape" && onCancel) {
                        event.preventDefault();
                        onCancel();
                        return;
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
              {pickerOpen && (
                <PopoverContent
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
                    dismissReferences();
                  }}
                  onInteractOutside={(event) => {
                    if (event.target instanceof Node && anchor.current?.contains(event.target))
                      event.preventDefault();
                  }}
                >
                  <ReferencePickerLink
                    value={{
                      listId: pickerListId,
                      handle: picker,
                      onActiveOptionChange: setActiveOptionId,
                      onDismiss: dismissReferences,
                    }}
                  >
                    {renderReferences(activeReference, insertReference)}
                  </ReferencePickerLink>
                </PopoverContent>
              )}
              {attachmentDrafts}
              <InputGroupAddon align="block-end">
                <div className="-ml-1 flex w-full min-w-0 flex-wrap items-center gap-0.5">
                  <ComposerToolbar pending={pending} onInsert={insert} />
                  <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
                  {attachmentControls}
                  <ComposerSendControls
                    draft={draft}
                    canSend={canSend}
                    pending={pending}
                    submitLabel={submitLabel}
                    secondaryAction={secondaryAction}
                  />
                </div>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </Popover>
        {error && <FormMessage error={error} errorDescription={errorDescription} />}
        {error && (
          <p className="text-xs text-muted-foreground" role="status">
            Your draft is still here.
          </p>
        )}
      </Field>
    </form>
  );
}

function ComposerSendControls({
  draft,
  canSend,
  pending,
  submitLabel,
  secondaryAction,
}: {
  draft: string;
  canSend: boolean;
  pending: boolean;
  submitLabel: string;
  secondaryAction?: ReactNode;
}) {
  const limitId = useId();
  const overBy = draft.length - messageMaxLength;
  const nearLimit = overBy > -1000;
  return (
    <span
      className={cn(
        "ml-auto min-w-0 items-center gap-3 pl-2",
        nearLimit ? "contents @lg:flex" : "flex",
      )}
    >
      {nearLimit && (
        <span
          id={limitId}
          aria-live="polite"
          className={cn(
            "order-last w-full pt-1 text-xs font-normal tabular-nums @lg:order-none @lg:w-auto @lg:truncate @lg:pt-0",
            overBy > 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {overBy > 0
            ? `Remove ${overBy.toLocaleString("en-US")} ${overBy === 1 ? "character" : "characters"} to send`
            : `${(messageMaxLength - draft.length).toLocaleString("en-US")} characters left`}
        </span>
      )}
      {secondaryAction}
      <PendingButton
        type="submit"
        size="sm"
        className={cn("min-w-16", nearLimit && "ml-auto @lg:ml-0")}
        aria-describedby={nearLimit ? limitId : undefined}
        disabled={!canSend}
        pending={pending}
      >
        <Send aria-hidden="true" />
        {submitLabel}
      </PendingButton>
    </span>
  );
}
