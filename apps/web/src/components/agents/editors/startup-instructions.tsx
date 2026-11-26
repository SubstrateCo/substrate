import {
  harnessInstructionsFiles,
  startupInstructions,
  type HarnessKind,
} from "@substrate/contracts/harness";

import { useId } from "react";

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Heading } from "@/components/ui/heading";

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
  // The create dialog and the instructions settings can both show this at once.
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="space-y-1">
        <Heading level={4} variant="inherit" id={titleId} className="sr-only">
          Substrate instructions
        </Heading>
        <p className="text-xs text-muted-foreground">
          Written to {harnessInstructionsFiles[harness]} before your additional instructions for new
          sessions. Existing agent-folder files are kept; Reset defaults in Skills rewrites them.
        </p>
      </div>
      <CodeBlock size="sm" variant="muted">
        <CodeBlockContent wrap className="max-h-64">
          {text}
        </CodeBlockContent>
      </CodeBlock>
    </section>
  );
}
