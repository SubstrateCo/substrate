import { useRef, useState } from "react";
import { Bold, Code, Italic, Send } from "lucide-react";
import { Button } from "../primitives/button";
import { Textarea } from "../primitives/textarea";
import { FormMessage } from "../auth/form-message";
import { EmojiPicker } from "./emoji-picker";
import { PendingButton } from "../feedback/pending-button";

export function Composer({
  onSend,
  pending = false,
  error,
  label,
  defaultValue = "",
}: {
  onSend: (body: string, onSuccess: () => void) => void;
  pending?: boolean;
  error?: Error | null;
  label: string;
  defaultValue?: string;
}) {
  const [draft, setDraft] = useState(defaultValue);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!draft.trim() || pending) return;
    onSend(draft.trim(), () => {
      setDraft("");
      textarea.current?.focus();
    });
  };
  const insert = (prefix: string, suffix = "") => {
    const start = textarea.current?.selectionStart ?? draft.length;
    const end = textarea.current?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + prefix + draft.slice(start, end) + suffix + draft.slice(end));
    textarea.current?.focus();
  };
  return (
    <form
      className="relative space-y-2 p-3 pt-2 sm:p-4 sm:pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormMessage
        error={error}
        errorDescription="Your message couldn’t be sent. Your draft is still here. Try sending it again."
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-raised transition-shadow focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/15">
        <div className="flex items-center gap-1 border-b border-border/60 bg-muted/30 px-2 py-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Bold text"
            disabled={pending}
            onClick={() => insert("**", "**")}
          >
            <Bold />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Italic text"
            disabled={pending}
            onClick={() => insert("_", "_")}
          >
            <Italic />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Code text"
            disabled={pending}
            onClick={() => insert("`", "`")}
          >
            <Code />
          </Button>
        </div>
        <Textarea
          variant="composer"
          ref={textarea}
          aria-label={label}
          placeholder={label}
          value={draft}
          maxLength={20000}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          className="h-24 min-h-16 max-h-[25dvh] resize-y"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between px-2 pb-2">
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
        </div>
      </div>
    </form>
  );
}
