import { startupInstructions } from "@substrate/contracts/agent-tools";
import { harnessInstructionsFiles, type HarnessKind } from "@substrate/contracts/harness-runtime";

import { useId } from "react";

import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
import { Heading } from "@/components/ui/heading";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";

export function StartupInstructions({
  harness,
  name,
  agentId,
}: {
  harness: HarnessKind;
  name: string;
  agentId?: string;
}) {
  const { organizationId } = useWorkspaceScope();
  const text = startupInstructions({
    harness,
    name: name.trim() || "Your agent’s name",
    id: agentId ?? "Assigned when saved",
    organizationId,
  }).trimEnd();
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
