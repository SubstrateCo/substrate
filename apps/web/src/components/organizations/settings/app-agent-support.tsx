import { ItemFooter } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Blocks, Sparkles, type LucideIcon } from "lucide-react";

export type AppAgentSupport = { mcp: boolean | "read-only"; skill?: string };

export function AppAgentSupportFooter({ app, support }: { app: string; support: AppAgentSupport }) {
  if (!support.mcp && !support.skill) return null;
  return (
    <ItemFooter className="basis-auto justify-end">
      <ul aria-label={`${app} agent support`} className="flex items-center gap-1">
        {support.mcp && (
          <SupportIcon
            icon={Blocks}
            label="MCP enabled"
            description={
              support.mcp === "read-only"
                ? `Ask your agent privately about ${app} on its home desktop. Agents have read-only access.`
                : `Agents can read and change ${app} through MCP tools.`
            }
          />
        )}
        {support.skill && (
          <SupportIcon
            icon={Sparkles}
            label="Skill included"
            description={`Agents get the ${support.skill} skill, a guide to working in ${app}.`}
          />
        )}
      </ul>
    </ItemFooter>
  );
}

function SupportIcon({
  icon: Icon,
  label,
  description,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="img"
            aria-label={`${label}. ${description}`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Icon className="size-4" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{`${label}. ${description}`}</TooltipContent>
      </Tooltip>
    </li>
  );
}
