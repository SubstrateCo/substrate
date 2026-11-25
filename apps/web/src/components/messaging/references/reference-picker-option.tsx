import type { TaskStatus } from "@substrate/contracts/tasks";

import type { ReactNode } from "react";

import type { ReferenceKind } from "./reference-picker-view";
import { entityKinds } from "@/components/context/entity-kinds";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import { cn } from "cn";

function OptionContent({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="wrap-anywhere">{title}</span>
        {description && (
          <span className="text-xs font-normal wrap-anywhere text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </span>
  );
}

export function ReferencePickerLoadingOption() {
  return (
    <div
      aria-hidden="true"
      className={cn(buttonVariants({ variant: "property", size: "default" }), "w-full")}
    >
      <OptionContent
        icon={<SkeletonText width="1rem" className="shrink-0" />}
        title={<SkeletonText width="8rem" />}
        description={<SkeletonText width="6rem" />}
      />
    </div>
  );
}

export function ReferencePickerOption({
  id,
  kind,
  title,
  image,
  description,
  status,
  selected,
  onFocus,
  onSelect,
}: {
  id: string;
  kind: ReferenceKind;
  title: string;
  image?: string | null;
  description?: string;
  /** Tasks only: replaces the kind icon. */
  status?: TaskStatus;
  selected: boolean;
  onFocus: () => void;
  onSelect: () => void;
}) {
  const Icon = entityKinds[kind].icon;
  let icon = <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />;
  if (status) icon = <TaskStatusIcon status={status} />;
  if (kind === "person" || kind === "agent")
    icon = <PersonAvatar name={title} image={image} agent={kind === "agent"} size="xs" />;
  return (
    <Button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      variant="property"
      size="default"
      tabIndex={selected ? 0 : -1}
      className="w-full whitespace-normal"
      onFocus={onFocus}
      onClick={onSelect}
    >
      <OptionContent icon={icon} title={plainReferenceText(title)} description={description} />
    </Button>
  );
}
