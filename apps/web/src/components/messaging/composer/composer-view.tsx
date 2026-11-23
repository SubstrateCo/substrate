import { useContext, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { PendingButton } from "../../feedback/pending-button";
import { Field } from "../../ui/field";
import { InputGroup, InputGroupAddon } from "../../ui/input-group";
import { Kbd, KbdGroup } from "../../ui/kbd";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import type { WorkspaceReference } from "../references/entity-reference";
import { ReferenceEditor } from "../references/reference-editor";
import { ReferencePickerAccessibility } from "../references/reference-picker-context";
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
  hasAttachments?: boolean;
  attachmentsReady?: boolean;
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
      hasAttachments,
      attachmentsReady,
      submitDisabled,
      autoFocus,
    });
  const [references, setReferences] = useState(false);
  const [pickerAccessibility, setPickerAccessibility] = useState<{
    listId: string;
    selectedId?: string;
  } | null>(null);
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
                  listId={references && activeReference ? pickerAccessibility?.listId : undefined}
                  activeOptionId={
                    references && activeReference ? pickerAccessibility?.selectedId : undefined
                  }
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
                          ?.querySelector<HTMLElement>("[data-reference-picker]")
                          ?.dispatchEvent(
                            new KeyboardEvent("keydown", { key: event.key, bubbles: true }),
                          );
                        return;
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
                <ReferencePickerAccessibility value={setPickerAccessibility}>
                  {renderReferences(activeReference, insertReference, () => {
                    closeReferences();
                    requestFocus(caret);
                  })}
                </ReferencePickerAccessibility>
              </PopoverContent>
            )}
            <InputGroupAddon align="block-end">
              <div className="-ml-1 flex w-full min-w-0 items-center gap-0.5">
                <ComposerToolbar pending={pending} onInsert={insert} />
                <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
                {attachmentControls}
                <ComposerSendControls
                  draft={draft}
                  hasAttachments={hasAttachments}
                  attachmentsReady={attachmentsReady}
                  pending={pending}
                  submitLabel={submitLabel}
                  submitDisabled={submitDisabled}
                  secondaryAction={secondaryAction}
                />
              </div>
            </InputGroupAddon>
          </InputGroup>
        </Popover>
        {attachmentDrafts}
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
  hasAttachments,
  attachmentsReady,
  pending,
  submitLabel,
  submitDisabled,
  secondaryAction,
}: {
  draft: string;
  hasAttachments: boolean;
  attachmentsReady: boolean;
  pending: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  secondaryAction?: ReactNode;
}) {
  const limitId = useId();
  const overBy = draft.length - messageMaxLength;
  const nearLimit = overBy > -1000;
  return (
    <span className="ml-auto flex min-w-0 items-center gap-3 pl-2">
      {nearLimit ? (
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
      ) : (
        <span className="hidden truncate text-xs font-normal text-muted-foreground opacity-0 transition-opacity group-focus-within/composer:opacity-100 motion-reduce:transition-none @lg:inline">
          <Kbd>Enter</Kbd> to {submitLabel.toLowerCase()} ·{" "}
          <KbdGroup>
            <Kbd>Shift</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>{" "}
          for a new line · <Kbd>@</Kbd> to reference
        </span>
      )}
      {secondaryAction}
      <PendingButton
        type="submit"
        size="sm"
        className="min-w-16"
        aria-describedby={nearLimit ? limitId : undefined}
        disabled={
          (!draft.trim() && !hasAttachments) || !attachmentsReady || overBy > 0 || submitDisabled
        }
        pending={pending}
      >
        <Send aria-hidden="true" />
        {submitLabel}
      </PendingButton>
    </span>
  );
}
