import {
  harnessInstructionsFiles,
  startupInstructions,
  type HarnessKind,
} from "@startup-os/contracts/harness";

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
    // The preview reads before the agent is named, so an empty name shows a stand-in.
    name: name.trim() || "Your agent’s name",
    id: agentId ?? "Assigned when saved",
    organizationId: organizationId ?? "Active workspace",
  }).trimEnd();
  return (
    <section aria-labelledby="startup-instructions-title" className="grid gap-3">
      <div className="space-y-1">
        <h4 id="startup-instructions-title" className="sr-only">
          Startup OS instructions
        </h4>
        <p className="text-xs text-muted-foreground">
          Written to {harnessInstructionsFiles[harness]} before your additional instructions for new
          sessions. Existing agent-folder files are kept; Reset defaults in Skills rewrites them.
        </p>
      </div>
      <pre className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-muted-foreground">
        {text}
      </pre>
    </section>
  );
}
