import {
  harnessInstructionsFiles,
  startupInstructions,
  type HarnessKind,
} from "@startup-os/contracts/harness";

import { Sparkles } from "lucide-react";

export function StartupInstructions({
  harness,
  name,
  agentId,
  organizationId,
}: {
  harness: HarnessKind;
  name: string;
  agentId?: string;
  organizationId?: string | null;
}) {
  const text = startupInstructions({
    harness,
    name: name.trim(),
    id: agentId ?? "Assigned when saved",
    organizationId: organizationId ?? "Active workspace",
  }).trimEnd();
  return (
    <section
      aria-labelledby="startup-instructions-title"
      className="space-y-2 rounded-lg border bg-muted/25 p-3"
    >
      <div className="flex items-start gap-2">
        <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h4 id="startup-instructions-title" className="text-sm font-medium">
            Startup OS instructions
          </h4>
          <p className="text-xs text-muted-foreground">
            Written to {harnessInstructionsFiles[harness]} before your instructions when the agent
            folder is created. Use Reset defaults in Skills to write them again.
          </p>
        </div>
      </div>
      <pre className="max-h-40 overflow-y-auto font-mono text-xs wrap-anywhere whitespace-pre-wrap text-muted-foreground">
        {text}
      </pre>
    </section>
  );
}
