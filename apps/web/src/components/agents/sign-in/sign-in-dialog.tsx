import type { HarnessSignInStatus } from "@substrate/contracts/harness-runtime";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { FormMessage } from "@/components/feedback/form-message";
import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
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
import { TextLink } from "@/components/ui/text-link";
import { outputSegments } from "@/lib/agents/sign-in-output";
import { CircleAlert, CircleCheck, CircleSlash } from "lucide-react";

type SignInStatus = HarnessSignInStatus | "starting";

export type SignInDialogState = {
  type: "agent" | "terminal";
  status: SignInStatus;
  output: string;
};

type StatusLine = { icon: ReactNode; text: string };

function statusLine(label: string, status: SignInStatus, waiting: string): StatusLine {
  switch (status) {
    case "starting":
      return { icon: <Spinner aria-hidden="true" />, text: `Starting ${label}` };
    case "running":
      return { icon: <Spinner aria-hidden="true" />, text: waiting };
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

function positionedSegments(output: string) {
  let start = 0;
  return outputSegments(output).map((segment) => {
    const positioned = { ...segment, start };
    start += segment.text.length;
    return positioned;
  });
}

function OutputLog({ output, label }: { output: string; label: string }) {
  const log = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const element = log.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Follow the end of the log after new output renders.
  }, [output]);
  return (
    <CodeBlock size="sm">
      <CodeBlockContent
        ref={log}
        role="log"
        aria-label={`${label} sign-in output`}
        wrap
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 16;
        }}
        className="max-h-72 min-h-32"
      >
        {output ? (
          positionedSegments(output).map((segment) =>
            segment.href ? (
              <TextLink key={segment.start} href={segment.href}>
                {segment.text}
              </TextLink>
            ) : (
              <span key={segment.start}>{segment.text}</span>
            ),
          )
        ) : (
          <span className="text-muted-foreground">No output yet.</span>
        )}
      </CodeBlockContent>
    </CodeBlock>
  );
}

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
        void onSend(text.trim())
          .then(() => setText(""))
          .catch(() => {});
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
        disabled={disabled || !text.trim()}
      >
        Send
      </PendingButton>
    </form>
  );
}

function SignInStatusLine({ status }: { status: StatusLine }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0">
      {status.icon}
      <span className="min-w-0">{status.text}</span>
    </p>
  );
}

function TerminalSignInBody({
  label,
  state,
  sending,
  onSend,
  error,
}: {
  label: string;
  state: SignInDialogState;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  error: ReactNode;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect {label}</DialogTitle>
        <DialogDescription>Open the link below, then paste the code you get.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <SignInStatusLine status={statusLine(label, state.status, `Waiting for ${label}`)} />
        <div className="grid min-w-0 gap-3">
          <OutputLog output={state.output} label={label} />
          <InputLine disabled={state.status !== "running"} pending={sending} onSend={onSend} />
        </div>
        {error}
      </DialogBody>
    </>
  );
}

function AgentSignInBody({
  label,
  status,
  error,
}: {
  label: string;
  status: SignInStatus;
  error: ReactNode;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect {label}</DialogTitle>
        <DialogDescription>Your credentials stay with {label} on this desktop.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <SignInStatusLine status={statusLine(label, status, "Finish in your browser")} />
        {error}
      </DialogBody>
    </>
  );
}

function SignInFooter({
  status,
  onCancel,
  onRetry,
  onClose,
}: {
  status: SignInStatus;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (status === "starting" || status === "running")
    return (
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
    );
  const closeButton = (
    <Button type="button" variant="outline" onClick={onClose}>
      Close
    </Button>
  );
  if (status === "succeeded")
    return <div className="flex flex-col-reverse gap-2 sm:flex-row">{closeButton}</div>;
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row">
      {closeButton}
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

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
  error?: Error | null;
  sending: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const running = state.status === "starting" || state.status === "running";
  const close = running ? onCancel : onClose;
  const message = (
    <FormMessage error={error} errorDescription={`We couldn’t reach ${label}. Try again.`} />
  );
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent size="lg">
        {state.type === "terminal" ? (
          <TerminalSignInBody
            label={label}
            state={state}
            sending={sending}
            onSend={onSend}
            error={message}
          />
        ) : (
          <AgentSignInBody label={label} status={state.status} error={message} />
        )}
        <DialogFooter>
          <SignInFooter
            status={state.status}
            onCancel={onCancel}
            onRetry={onRetry}
            onClose={onClose}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
