import type { HarnessMcpServer } from "@substrate/contracts/harness";

import { useId, useState, type ReactNode } from "react";

import { FormDialog } from "@/components/feedback/form-dialog";
import { SegmentedControl } from "@/components/forms/segmented-control";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  draftFromServer,
  serverFromDraft,
  type McpServerDraft,
  type McpServerDraftErrors,
} from "@/lib/agents/mcp-server-draft";
import { Plus, X } from "lucide-react";

const transports = [
  { value: "stdio", label: "Local command" },
  { value: "http", label: "Remote URL" },
] as const;

const replaceAt = <T,>(items: readonly T[], index: number, value: T) =>
  items.map((item, at) => (at === index ? value : item));

/** A labelled single-line input with its error and description. */
function TextField({
  id,
  label,
  description,
  error,
  ...props
}: {
  id: string;
  label: string;
  description?: ReactNode;
  error?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  type?: string;
  onChange: (value: string) => void;
}) {
  const describedBy = [error && `${id}-error`, description && `${id}-description`]
    .filter(Boolean)
    .join(" ");
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...props}
        id={id}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
    </Field>
  );
}

function RemoveRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          <X />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A titled list of rows with an add button below, such as arguments. */
function RowGroup({
  id,
  title,
  description,
  addLabel,
  empty,
  onAdd,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  addLabel: string;
  empty: string;
  onAdd: () => void;
  children: ReactNode[];
}) {
  return (
    <div role="group" aria-labelledby={`${id}-title`} className="grid min-w-0 gap-2">
      <div className="space-y-1">
        <p id={`${id}-title`} className="text-sm font-medium">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children.length ? (
        <ul className="grid min-w-0 gap-2">{children}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
      <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onAdd}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  );
}

function RowError({ id, error }: { id: string; error?: string }) {
  return error ? <FieldError id={id}>{error}</FieldError> : null;
}

function StdioFields({
  id,
  draft,
  errors,
  update,
}: {
  id: string;
  draft: McpServerDraft;
  errors?: McpServerDraftErrors;
  update: (change: Partial<McpServerDraft>) => void;
}) {
  return (
    <>
      <TextField
        id={`${id}-command`}
        label="Command"
        description="The program that starts the server, such as npx or uvx. Substrate runs it without a shell."
        placeholder="npx"
        required
        maxLength={2000}
        value={draft.command}
        error={errors?.command}
        onChange={(command) => update({ command })}
      />
      <RowGroup
        id={`${id}-args`}
        title="Arguments"
        description="One argument per row, in order."
        addLabel="Add argument"
        empty="No arguments."
        onAdd={() => update({ args: [...draft.args, ""] })}
      >
        {draft.args.map((arg, index) => {
          const error = errors?.args[index];
          return (
            // oxlint-disable-next-line react/no-array-index-key -- rows are positional and have no ID.
            <li key={index} className="grid gap-1">
              <div className="flex min-w-0 gap-2">
                <Input
                  aria-label={`Argument ${index + 1}`}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-arg-${index}-error` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={10000}
                  className="min-w-0 flex-1"
                  placeholder={index === 0 ? "-y" : undefined}
                  value={arg}
                  onChange={(event) =>
                    update({ args: replaceAt(draft.args, index, event.target.value) })
                  }
                />
                <RemoveRow
                  label={`Remove argument ${index + 1}`}
                  onClick={() => update({ args: draft.args.filter((_, at) => at !== index) })}
                />
              </div>
              <RowError id={`${id}-arg-${index}-error`} error={error} />
            </li>
          );
        })}
      </RowGroup>
      <RowGroup
        id={`${id}-env`}
        title="Environment variables"
        description="Settings the server reads when it starts. Substrate refuses tokens, keys, and passwords."
        addLabel="Add variable"
        empty="No environment variables."
        onAdd={() => update({ environment: [...draft.environment, { key: "", value: "" }] })}
      >
        {draft.environment.map((row, index) => {
          const error = errors?.environment[index];
          const set = (change: Partial<typeof row>) =>
            update({ environment: replaceAt(draft.environment, index, { ...row, ...change }) });
          const describedBy = error ? `${id}-env-${index}-error` : undefined;
          return (
            // oxlint-disable-next-line react/no-array-index-key -- rows are positional and have no ID.
            <li key={index} className="grid gap-1">
              <div className="flex min-w-0 gap-2">
                <Input
                  aria-label={`Variable ${index + 1} name`}
                  aria-invalid={!!error}
                  aria-describedby={describedBy}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="NAME"
                  maxLength={200}
                  className="min-w-0 basis-2/5"
                  value={row.key}
                  onChange={(event) => set({ key: event.target.value })}
                />
                <Input
                  aria-label={`Variable ${index + 1} value`}
                  aria-invalid={!!error}
                  aria-describedby={describedBy}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="value"
                  maxLength={10000}
                  className="min-w-0 flex-1"
                  value={row.value}
                  onChange={(event) => set({ value: event.target.value })}
                />
                <RemoveRow
                  label={`Remove variable ${index + 1}`}
                  onClick={() =>
                    update({ environment: draft.environment.filter((_, at) => at !== index) })
                  }
                />
              </div>
              <RowError id={describedBy ?? ""} error={error} />
            </li>
          );
        })}
      </RowGroup>
    </>
  );
}

/** Adds or edits one user-added MCP server. Validation matches what the desktop stores. */
export function McpServerEditor({
  server,
  servers,
  pending,
  error,
  onClose,
  onSave,
  onRestoreFocus,
}: {
  /** The server to edit; absent for a new server. */
  server?: HarnessMcpServer;
  /** Every server of the agent, to keep new names unique. */
  servers: readonly HarnessMcpServer[];
  pending: boolean;
  error?: Error | null;
  onClose: () => void;
  onSave: (server: HarnessMcpServer) => void;
  onRestoreFocus?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftFromServer(server));
  const [submitted, setSubmitted] = useState(false);
  const result = submitted ? serverFromDraft(draft, { id: server?.id, servers }) : undefined;
  const errors = result?.errors;
  const update = (change: Partial<McpServerDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  return (
    <FormDialog
      title={server ? `Edit ${server.name}` : "New MCP server"}
      saveLabel={server ? "Save server" : "Create server"}
      description="A tool server this agent can use. Substrate keeps it on this desktop and gives it to the agent when each session starts. Credentials stay with the server or the agent, never here."
      pending={pending}
      error={error}
      errorDescription="We couldn’t save this server. Try again."
      onClose={onClose}
      onRestoreFocus={onRestoreFocus}
      onSubmit={() => {
        setSubmitted(true);
        const next = serverFromDraft(draft, { id: server?.id, servers });
        if (next.server) onSave(next.server);
      }}
    >
      <TextField
        id={`${id}-name`}
        label="Name"
        description={server ? undefined : "Shown in this list. Its ID comes from the name."}
        placeholder="For example: Linear"
        required
        maxLength={200}
        value={draft.name}
        error={errors?.name}
        onChange={(name) => update({ name })}
      />
      <div className="grid gap-2">
        <p id={`${id}-transport`} className="text-sm font-medium">
          Connection
        </p>
        <div className="w-fit">
          <SegmentedControl
            aria-label="Connection"
            value={draft.transport}
            options={transports}
            onValueChange={(transport) => update({ transport })}
          />
        </div>
      </div>
      {draft.transport === "stdio" ? (
        <StdioFields id={id} draft={draft} errors={errors} update={update} />
      ) : (
        <TextField
          id={`${id}-url`}
          label="URL"
          description="The server’s MCP endpoint. If it needs a sign-in, the agent handles it."
          placeholder="https://mcp.example.com/mcp"
          type="url"
          required
          maxLength={4000}
          value={draft.url}
          error={errors?.url}
          onChange={(url) => update({ url })}
        />
      )}
    </FormDialog>
  );
}
