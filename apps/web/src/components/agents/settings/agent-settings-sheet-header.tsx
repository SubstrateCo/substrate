import { PageSheetHeader } from "@/components/layout/page-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { agentSettingsPageLabels, type AgentSettingsPage } from "@/lib/agent-work/agent-sections";
import { ArrowLeft } from "lucide-react";

export function AgentSettingsSheetHeader({
  page,
  onBack,
}: {
  page: AgentSettingsPage;
  onBack: () => void;
}) {
  if (page === "overview") return <PageSheetHeader title={agentSettingsPageLabels.overview} />;
  return (
    <PageSheetHeader
      title={
        <span className="flex min-w-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Back to settings"
                onClick={onBack}
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to settings</TooltipContent>
          </Tooltip>
          <span className="truncate">{agentSettingsPageLabels[page]}</span>
        </span>
      }
    />
  );
}
