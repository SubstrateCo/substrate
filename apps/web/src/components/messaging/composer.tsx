import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bold, Code, Italic, Send } from "lucide-react";
import { queryKeys } from "@/queries/keys";
import { sendMessage } from "@/server/messaging";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormMessage } from "@/components/auth/form-message";
import { EmojiPicker } from "./emoji-picker";

export function Composer({
  organizationId,
  conversationId,
  threadId,
  label,
}: {
  organizationId: string;
  conversationId: string;
  threadId?: string;
  label: string;
}) {
  const [draft, setDraft] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: async (body: string) => {
      return sendMessage({ data: { organizationId, conversationId, threadId, body } });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging(organizationId) }),
  });
  const submit = () => {
    if (!draft.trim() || send.isPending) return;
    send.mutate(draft.trim(), {
      onSuccess: () => {
        setDraft("");
        textarea.current?.focus();
      },
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
      className="space-y-2 p-4 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormMessage error={send.error} />
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
        <div className="flex items-center gap-1 border-b bg-muted/35 px-2 py-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Bold text"
            disabled={send.isPending}
            onClick={() => insert("**", "**")}
          >
            <Bold />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Italic text"
            disabled={send.isPending}
            onClick={() => insert("_", "_")}
          >
            <Italic />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Code text"
            disabled={send.isPending}
            onClick={() => insert("`", "`")}
          >
            <Code />
          </Button>
        </div>
        <Textarea
          ref={textarea}
          aria-label={label}
          placeholder={label}
          value={draft}
          maxLength={20000}
          disabled={send.isPending}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-24 resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <EmojiPicker onSelect={(emoji) => insert(emoji)} disabled={send.isPending} />
          <Button
            type="submit"
            size="sm"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            disabled={!draft.trim() || send.isPending}
          >
            <Send className="size-3.5" />
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
      <p className="text-right text-[11px] text-muted-foreground">
        Markdown supported · Shift + Enter for a new line
      </p>
    </form>
  );
}
