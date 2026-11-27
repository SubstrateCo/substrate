import { AppAgentSupportFooter, type AppAgentSupport } from "./app-agent-support";
import { Tag } from "@/components/feedback/tag";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LucideIcon } from "lucide-react";

/** Whether the viewer can turn an app on or off. Required apps are always on. */
export type AppCardMode =
  | { kind: "required" }
  | { kind: "editable"; enabled: boolean; pending: boolean; onChange: (enabled: boolean) => void }
  | { kind: "readOnly"; enabled: boolean };

/** One app row: its name, description, agent support, and control. */
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
    <section aria-label={label} className="py-2">
      <Item>
        <ItemMedia>
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5" aria-hidden />
          </div>
        </ItemMedia>
        <ItemContent className="min-w-0 basis-48">
          <ItemTitle>
            {mode.kind === "editable" ? <Label htmlFor={controlId}>{label}</Label> : label}
          </ItemTitle>
          {/* ItemDescription clamps to two lines; these descriptions run longer. */}
          <p className="text-sm text-muted-foreground">{description}</p>
        </ItemContent>
        <ItemActions className="ml-auto">
          <AppAgentSupportFooter app={label} support={agentSupport} />
          <div className="flex w-20 justify-end">
            <AppControl id={controlId} mode={mode} />
          </div>
        </ItemActions>
      </Item>
    </section>
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
