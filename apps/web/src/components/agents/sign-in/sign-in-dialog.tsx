import type { HarnessSignInStatus } from "@substrate/contracts/harness";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { outputSegments } from "@/lib/agents/sign-in-output";
import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";

export type SignInDialogState = {
  type: "agent" | "terminal";
  status: HarnessSignInStatus | "starting";
  output: string;
};

type StatusLine = { icon: ReactNode; text: string };

function statusLine(label: string, state: SignInDialogState): StatusLine {
  switch (state.status) {
    case "starting":
      return { icon: <Spinner aria-hidden="true" />, text: `Starting ${label}` };
    case "running":
      return {
        icon: <Spinner aria-hidden="true" />,
        text: state.type === "agent" ? "Finish in your browser" : `Waiting for ${label}`,
      };
    case "succeeded":
      return {
        icon: <CircleCheck aria-hidden="true" className="text-success" />,
        text: `${label} account connected`,
      };
    case "failed":
      return {
        icon: <CircleAlert aria-hidden="true" className="text-destructive" />,
        text: "Couldn’t connect. Check the output and try again.",
      };
    case "cancelled":
      return { icon: <CircleSlash aria-hidden="true" />, text: "Cancelled" };
  }
}

/** Terminal output with links that open in the system browser. Follows new output at the end. */
function OutputLog({ output, label }: { output: string; label: string }) {
  const log = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const element = log.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [output]);
  return (
    <pre
      ref={log}
      role="log"
      aria-label={`${label} sign-in output`}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 16;
      }}
      className="max-h-72 min-h-32 overflow-y-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {output ? (
        outputSegments(output).map((segment, index) =>
          segment.href ? (
            <a
              // Output only grows, so a segment keeps its index.
              // oxlint-disable-next-line react/no-array-index-key -- segments have no other identity.
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {segment.text}
            </a>
          ) : (
            // oxlint-disable-next-line react/no-array-index-key -- segments have no other identity.
            <span key={index}>{segment.text}</span>
          ),
        )
      ) : (
        <span className="text-muted-foreground">No output yet.</span>
      )}
    </pre>
  );
}

/** One line for the login command, such as a code from the sign-in page. */
function InputLine({
  disabled,
  pending,
  onSend,
}: {
  disabled: boolean;
  pending: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex min-w-0 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        // React events cross portals; the agent form around the launcher must not submit.
        event.stopPropagation();
        if (disabled || pending || !text.trim()) return;
        // A failed send keeps the text; the dialog shows the error.
        void onSend(text.trim()).then(
          () => setText(""),
          () => {},
        );
      }}
    >
      <Input
        aria-label="Code or reply"
        placeholder="Paste code"
        autoComplete="off"
        spellCheck={false}
        maxLength={4096}
        disabled={disabled}
        value={text}
        onChange={(event) => setText(event.target.value.replace(/[\r\n]/g, ""))}
      />
      <PendingButton
        type="submit"
        variant="outline"
        pending={pending}
        pendingLabel="Sending"
        disabled={disabled || !text.trim()}
      >
        Send
      </PendingButton>
    </form>
  );
}

/**
 * Sign-in to a native agent. A terminal sign-in shows the login command's output and takes one
 * line of input at a time. An agent sign-in waits while the agent finishes in the browser.
 */
export function SignInDialog({
  label,
  state,
  error,
  sending,
  onSend,
  onCancel,
  onRetry,
  onClose,
}: {
  label: string;
  state: SignInDialogState;
  /** Starting, reading, sending, or cancelling failed. */
  error?: Error | null;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  /** Stops a running sign-in and closes. */
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const running = state.status === "starting" || state.status === "running";
  const finished = state.status === "failed" || state.status === "cancelled";
  const status = statusLine(label, state);
  const close = running ? onCancel : onClose;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription>
            {state.type === "terminal"
              ? "Open the link below, then paste the code you get."
              : `Your credentials stay with ${label} on this desktop.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p
            role="status"
            className="flex items-center gap-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0"
          >
            {status.icon}
            <span className="min-w-0">{status.text}</span>
          </p>
          {state.type === "terminal" && (
            <div className="grid min-w-0 gap-3">
              <OutputLog output={state.output} label={label} />
              <InputLine disabled={state.status !== "running"} pending={sending} onSend={onSend} />
            </div>
          )}
          <FormMessage error={error} errorDescription={`We couldn’t reach ${label}. Try again.`} />
        </DialogBody>
        <DialogFooter>
          {running ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              {finished && (
                <Button type="button" onClick={onRetry}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
