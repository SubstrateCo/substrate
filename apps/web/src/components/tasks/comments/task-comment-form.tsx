import { useEffect, useRef, useState, type ReactNode } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Field } from "../../ui/field";
import { InputGroup } from "../../ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import {
  ReferenceEditor,
  type ReferenceEditorHandle,
} from "@/components/messaging/references/reference-editor";
import { ReferencePickerAccessibility } from "@/components/messaging/references/reference-picker";
import {
  referenceQuery,
  type ReferenceQuery,
} from "@/components/messaging/references/reference-query";

const maxLength = 20000;
const label = "Add a comment";

/** Comments reference people, agents, tasks, and projects, so only "@" opens the picker. */
const commentReferenceQuery = (body: string, caret: number) => {
  const query = referenceQuery(body, caret);
  return query?.trigger === "@" ? query : null;
};

export function TaskCommentForm({
  pending,
  error,
  onSend,
  onDirtyChange,
  renderReferences,
}: {
  pending: boolean;
  error?: Error | null;
  onSend: (body: string, onSuccess: () => void) => void;
  onDirtyChange: (dirty: boolean) => void;
  renderReferences?: (
    query: ReferenceQuery,
    onInsert: (token: string, reference: WorkspaceReference) => void,
    onClose: () => void,
  ) => ReactNode;
}) {
  const [body, setBody] = useState("");
  const [caret, setCaret] = useState(0);
  const [inserted, setInserted] = useState<WorkspaceReference[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickerAccessibility, setPickerAccessibility] = useState<{
    listId: string;
    selectedId?: string;
  } | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ caret: number } | null>(null);
  const editor = useRef<ReferenceEditorHandle>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const activeReference = renderReferences ? commentReferenceQuery(body, caret) : null;
  const open = picking && activeReference !== null;
  // The editor applies a new body in a layout effect, so the caret moves after it.
  useEffect(() => {
    if (focusRequest && !pending) editor.current?.focusAt(focusRequest.caret);
  }, [focusRequest, pending]);
  const change = (value: string) => {
    setBody(value);
    onDirtyChange(Boolean(value));
  };
  const send = () => {
    const sendable = !!body.trim() && body.length <= maxLength;
    if (!sendable || pending || composing.current) return;
    // The editor is read-only while the comment posts, so the draft is still this body.
    onSend(body.trim(), () => {
      change("");
      setCaret(0);
      setInserted([]);
    });
  };
  const insertReference = (token: string, reference: WorkspaceReference) => {
    if (!activeReference) return;
    setInserted((items) => [
      ...items.filter((item) => item.id !== reference.id || item.kind !== reference.kind),
      reference,
    ]);
    const nextCaret = activeReference.start + token.length + 1;
    change(body.slice(0, activeReference.start) + token + " " + body.slice(activeReference.end));
    setCaret(nextCaret);
    setFocusRequest({ caret: nextCaret });
    setPicking(false);
  };
  const overBy = body.length - maxLength;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Field>
        <Popover open={open} onOpenChange={setPicking}>
          <InputGroup className="h-auto">
            <PopoverAnchor asChild>
              <div
                ref={anchor}
                data-slot="input-group-control"
                className="relative w-full min-w-0"
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
              >
                {!body && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-2 truncate text-sm text-muted-foreground"
                  >
                    Leave a comment. Type @ to mention.
                  </span>
                )}
                <ReferenceEditor
                  ref={editor}
                  label={label}
                  value={body}
                  references={inserted}
                  disabled={pending}
                  listId={open ? pickerAccessibility?.listId : undefined}
                  activeOptionId={open ? pickerAccessibility?.selectedId : undefined}
                  onChange={(value, position) => {
                    change(value);
                    setCaret(position);
                    if (!composing.current) setPicking(!!commentReferenceQuery(value, position));
                  }}
                  onSelectionChange={(position) => {
                    setCaret(position);
                    if (!commentReferenceQuery(body, position)) setPicking(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.isComposing || composing.current) return;
                    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
                    if (open && !modified) {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setPicking(false);
                        return;
                      }
                      if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
                        event.preventDefault();
                        picker.current
                          ?.querySelector<HTMLElement>("[data-reference-picker]")
                          ?.dispatchEvent(
                            new KeyboardEvent("keydown", { key: event.key, bubbles: true }),
                          );
                        return;
                      }
                    }
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      send();
                    }
                  }}
                />
              </div>
            </PopoverAnchor>
            {open && renderReferences && (
              <PopoverContent
                ref={picker}
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
                  setPicking(false);
                }}
                onInteractOutside={(event) => {
                  if (event.target instanceof Node && anchor.current?.contains(event.target))
                    event.preventDefault();
                }}
              >
                <ReferencePickerAccessibility value={setPickerAccessibility}>
                  {renderReferences(activeReference, insertReference, () => {
                    setPicking(false);
                    setFocusRequest({ caret });
                  })}
                </ReferencePickerAccessibility>
              </PopoverContent>
            )}
          </InputGroup>
        </Popover>
      </Field>
      <FormMessage error={error} />
      <div className="flex items-center justify-end gap-3">
        {overBy > 0 && (
          <span aria-live="polite" className="truncate text-xs text-destructive tabular-nums">
            Remove {overBy.toLocaleString("en-US")} {overBy === 1 ? "character" : "characters"} to
            post
          </span>
        )}
        <PendingButton
          size="sm"
          disabled={!body.trim() || overBy > 0}
          pending={pending}
          pendingLabel="Posting comment."
        >
          Post comment
        </PendingButton>
      </div>
    </form>
  );
}
