import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { FormMessage } from "../../auth/form-message";
import { PendingButton } from "../../feedback/pending-button";
import { Field } from "../../ui/field";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../ui/input-group";
import { Popover, PopoverAnchor, PopoverContent } from "../../ui/popover";
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
    query: string,
    onInsert: (token: string) => void,
    onClose: () => void,
  ) => ReactNode;
}) {
  const { draft, setDraft, textarea, setComposing, isComposing, submit, insert } = useComposerDraft(
    {
      draftKey,
      defaultValue,
      pending,
      onSend,
    },
  );
  const [references, setReferences] = useState(false);
  const referencePicker = useRef<HTMLDivElement>(null);
  const closeReferences = () => {
    setReferences(false);
  };
  const insertReference = (token: string) => {
    setDraft(
      /(?:^|\s)@[^\s[\]]*$/.test(draft)
        ? draft.replace(/@[^\s[\]]*$/, `${token} `)
        : `${draft}${draft.endsWith(" ") || !draft ? "" : " "}${token} `,
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
            <PopoverAnchor asChild data-slot="input-group-control">
              <InputGroupTextarea
                ref={textarea}
                aria-label={label}
                placeholder={label}
                value={draft}
                maxLength={20000}
                disabled={pending}
                onCompositionStart={() => {
                  setComposing(true);
                }}
                onCompositionEnd={(event) => {
                  setComposing(false);
                  setReferences(/(?:^|\s)@[^\s[\]]*$/.test(event.currentTarget.value));
                }}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (!isComposing()) setReferences(/(?:^|\s)@[^\s[\]]*$/.test(event.target.value));
                }}
                rows={1}
                className="max-h-[25dvh] min-h-10 resize-none"
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || isComposing()) return;
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
            </PopoverAnchor>
            {references && renderReferences && (
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
                  if (document.activeElement === document.body) textarea.current?.focus();
                }}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  closeReferences();
                }}
                onInteractOutside={(event) => {
                  if (event.target instanceof Node && textarea.current?.contains(event.target))
                    event.preventDefault();
                }}
              >
                {renderReferences(
                  /(?:^|\s)@([^\s[\]]*)$/.exec(draft)?.[1] ?? "",
                  insertReference,
                  closeReferences,
                )}
              </PopoverContent>
            )}
            <InputGroupAddon align="block-end" className="justify-between">
              <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={pending} />
              <PendingButton
                type="submit"
                size="sm"
                className="min-w-16"
                disabled={!draft.trim()}
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
