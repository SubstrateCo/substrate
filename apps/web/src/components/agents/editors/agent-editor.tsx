import type { AgentConfiguration, SaveAgentInput } from "@startup-os/contracts/agents";
import { saveAgentInput } from "@startup-os/contracts/agents";

import { useState, type ReactNode } from "react";

import { harnessOptions } from "../harness-meta";
import { EditorDialog } from "./editor-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function AgentEditor({
  agent,
  picture,
  pending,
  onClose,
  onSave,
}: {
  agent?: AgentConfiguration;
  picture?: ReactNode;
  pending: boolean;
  onClose: () => void;
  onSave: (input: SaveAgentInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<SaveAgentInput>(
    agent
      ? {
          id: agent.id,
          name: agent.name,
          instructions: agent.instructions,
          harness: agent.harness,
          model: agent.model,
          enabled: agent.enabled,
          useStartupDefaults: agent.useStartupDefaults,
        }
      : {
          name: "",
          instructions: "",
          harness: "opencode",
          model: undefined,
          enabled: true,
          useStartupDefaults: true,
        },
  );
  const harness = harnessOptions.find((option) => option.value === draft.harness)!;
  return (
    <EditorDialog
      title={agent ? "Edit agent" : "Create agent"}
      saveLabel="Save agent"
      description="These agent settings belong to you, not your organization."
      pending={pending}
      onClose={onClose}
      onSave={() => onSave(saveAgentInput.parse(draft))}
    >
      {agent ? (
        picture
      ) : (
        <p className="text-sm text-muted-foreground">
          Save this agent before adding a profile picture
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="agent-name">Agent name</Label>
        <Input
          id="agent-name"
          required
          maxLength={200}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="agent-harness">Harness</Label>
        <Select
          value={draft.harness}
          onValueChange={(value) => {
            const option = harnessOptions.find((entry) => entry.value === value);
            if (option) setDraft({ ...draft, harness: option.value, model: undefined });
          }}
        >
          <SelectTrigger id="agent-harness">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {harnessOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{harness.description}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="agent-model">Model</Label>
        <Input
          id="agent-model"
          placeholder={harness.modelHint}
          value={draft.model ?? ""}
          onChange={(event) => setDraft({ ...draft, model: event.target.value || undefined })}
        />
        <p className="text-sm text-muted-foreground">
          Optional. Leave blank to use the harness default. Sign in through the installed harness,
          not here.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="agent-instructions">Instructions</Label>
        <Textarea
          id="agent-instructions"
          rows={5}
          maxLength={100000}
          value={draft.instructions}
          onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="agent-enabled"
          checked={draft.enabled}
          onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
        />
        <Label htmlFor="agent-enabled">Enabled</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        New agents automatically include the bundled Startup OS skill and built-in Startup OS MCP
        server with only hello_world. This does not grant access to app data.
      </p>
    </EditorDialog>
  );
}
