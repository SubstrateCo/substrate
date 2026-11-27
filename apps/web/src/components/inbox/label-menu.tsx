import {
  labelFilterModes,
  mailColors,
  type MailColor,
  type MailLabel,
} from "@substrate/contracts/mail";
import type { LabelDisplayChange } from "@substrate/contracts/mail/ipc";

import { useMutation } from "@tanstack/react-query";

import { useState } from "react";

import { useInboxWorkspace } from "./inbox-workspace-context";
import { defaultLabelColor, ink, labelName } from "./mail-colors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, ChevronRight, Ellipsis } from "lucide-react";
import { toast } from "sonner";

export type LabelActions = {
  onLabelColor: (mailbox: string, label: string, color: MailColor | null) => Promise<void>;
  onLabelVisibility: (mailbox: string, change: LabelDisplayChange) => Promise<void>;
};
const modeNames = { show: "Show", unread: "Show if unread", hide: "Hide" };
export function LabelMenu({ mailboxId, label }: { mailboxId: string; label: MailLabel }) {
  const { onLabelColor, onLabelVisibility } = useInboxWorkspace().labelActions;
  const [colors, setColors] = useState(false);
  const save = useMutation({
    mutationFn: (work: () => Promise<void>) => work(),
    onError: () => toast.error("Couldn't save the label settings. Try again."),
  });
  const name = `Options for ${labelName(label)}`;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setColors(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={name} disabled={save.isPending}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent aria-label={name} align="end">
        {colors ? (
          <LabelColorPanel
            label={label}
            onBack={() => setColors(false)}
            onColor={(color) => save.mutate(() => onLabelColor(mailboxId, label.id, color))}
          />
        ) : (
          <LabelSettingsPanel
            label={label}
            onColors={() => setColors(true)}
            onVisibility={(change) => save.mutate(() => onLabelVisibility(mailboxId, change))}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LabelColorPanel({
  label,
  onBack,
  onColor,
}: {
  label: MailLabel;
  onBack: () => void;
  onColor: (color: MailColor | null) => void;
}) {
  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onBack();
        }}
      >
        <ArrowLeft aria-hidden />
        Label settings
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        aria-label="Label color"
        className="grid grid-cols-2"
        value={label.color ?? "auto"}
        onValueChange={(v) => onColor(mailColors.find((c) => c === v) ?? null)}
      >
        <DropdownMenuRadioItem value="auto" className="col-span-2">
          Automatic ({defaultLabelColor(label)})
        </DropdownMenuRadioItem>
        {mailColors.map((c) => (
          <DropdownMenuRadioItem value={c} key={c}>
            <span aria-hidden className={`size-3 rounded-sm bg-current ${ink[c]}`} />
            {c}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

function LabelSettingsPanel({
  label,
  onColors,
  onVisibility,
}: {
  label: MailLabel;
  onColors: () => void;
  onVisibility: (change: LabelDisplayChange) => void;
}) {
  return (
    <>
      <DropdownMenuItem
        onSelect={(e) => {
          e.preventDefault();
          onColors();
        }}
      >
        <span
          aria-hidden
          className={`size-3 rounded-sm bg-current ${ink[label.color ?? defaultLabelColor(label)]}`}
        />
        Label color
        <ChevronRight className="ml-auto" aria-hidden />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>In label list</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label="In label list"
        value={label.filterMode ?? "show"}
        onValueChange={(v) => {
          const mode = labelFilterModes.find((m) => m === v);
          if (mode) onVisibility({ area: "sidebar", labelId: label.id, mode });
        }}
      >
        {labelFilterModes.map((mode) => (
          <DropdownMenuRadioItem key={mode} value={mode}>
            {modeNames[mode]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>In message list</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label="In message list"
        value={label.hideInRows ? "hide" : "show"}
        onValueChange={(v) =>
          onVisibility({ area: "rows", labelId: label.id, visible: v === "show" })
        }
      >
        <DropdownMenuRadioItem value="show">Show</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="hide">Hide</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  );
}
