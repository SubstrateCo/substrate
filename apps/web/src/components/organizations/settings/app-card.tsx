import { AppAgentSupportFooter, type AppAgentSupport } from "./app-agent-support";
import { Tag } from "@/components/feedback/tag";
import { Item, ItemContent, ItemHeader, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LucideIcon } from "lucide-react";

/** Whether the viewer can turn an app on or off. Required apps are always on. */
export type AppCardMode =
  | { kind: "required" }
  | { kind: "editable"; enabled: boolean; pending: boolean; onChange: (enabled: boolean) => void }
  | { kind: "readOnly"; enabled: boolean };

/** One app tile: its name and control, what it does, and what agents get from it. */
export function AppCard({
  id,
  label,
  icon: Icon,
  description,
  agentSupport,
  mode,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  agentSupport: AppAgentSupport;
  mode: AppCardMode;
}) {
  const controlId = `organization-app-${id}`;
  return (
    <Item variant="outline" asChild className="h-full flex-col flex-nowrap items-stretch">
      <section aria-label={label}>
        <ItemHeader className="basis-auto flex-wrap">
          <div className="flex shrink-0 items-center gap-3">
            <ItemMedia>
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <Icon className="size-5" aria-hidden />
              </div>
            </ItemMedia>
            <ItemTitle>
              {mode.kind === "editable" ? <Label htmlFor={controlId}>{label}</Label> : label}
            </ItemTitle>
          </div>
          <AppControl id={controlId} mode={mode} />
        </ItemHeader>
        <ItemContent>
          {/* ItemDescription clamps to two lines; these descriptions run longer. */}
          <p className="text-sm text-muted-foreground">{description}</p>
        </ItemContent>
        <AppAgentSupportFooter app={label} support={agentSupport} />
      </section>
    </Item>
  );
}

function AppControl({ id, mode }: { id: string; mode: AppCardMode }) {
  if (mode.kind === "required") return <Tag>Required</Tag>;
  if (mode.kind === "readOnly") return <Tag>{mode.enabled ? "Enabled" : "Disabled"}</Tag>;
  return (
    <Switch
      id={id}
      checked={mode.enabled}
      disabled={mode.pending}
      onCheckedChange={mode.onChange}
    />
  );
}
