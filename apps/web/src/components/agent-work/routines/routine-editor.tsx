import { useState } from "react";

import { PendingButton } from "@/components/feedback/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type RoutineDraft = {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  enabled: boolean;
};

/** Edits a routine. Saving creates a revision that runs only after the owner approves it. */
export function RoutineEditor({
  initial,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: RoutineDraft;
  pending: boolean;
  error?: string | null;
  onSave: (draft: RoutineDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <form
      aria-label="Routine"
      className="grid gap-3 rounded-xl border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="routine-name">Name</Label>
        <Input
          id="routine-name"
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="routine-prompt">What to do</Label>
        <Textarea
          id="routine-prompt"
          rows={4}
          value={draft.prompt}
          onChange={(event) => set("prompt", event.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="routine-cron">Schedule (cron)</Label>
          <Input
            id="routine-cron"
            placeholder="0 9 * * 1-5"
            value={draft.cron}
            onChange={(event) => set("cron", event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="routine-timezone">Time zone</Label>
          <Input
            id="routine-timezone"
            value={draft.timezone}
            onChange={(event) => set("timezone", event.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="routine-enabled"
          checked={draft.enabled}
          onCheckedChange={(checked) => set("enabled", checked)}
        />
        <Label htmlFor="routine-enabled">Enabled</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        It posts in your direct message with the agent. Each saved change needs your approval before
        it runs.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <PendingButton type="submit" size="sm" pending={pending} pendingLabel="Saving">
          Save
        </PendingButton>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
